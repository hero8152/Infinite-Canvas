# -*- coding: utf-8 -*-
"""自媒体日更工作流（Media Daily Workflow）

每天在设定时间自动执行一条内容流水线：
    选题 → 文案 → 口播/分镜脚本 → 图片提示词 → 生成「智能画布」节点图（可选：直接出图）

产出物是一张 smart 画布（data/canvases/*.json），节点按 ComfyUI 的方式连线：
    今日选题 → 文案 → 分镜脚本 → 每个分镜的提示词节点 → 图片节点
打开画布后可直接逐节点微调、一键运行生图。

Loop（每日循环）标准：
  * 幂等：以本地日期（YYYY-MM-DD）为 run key，当天已有成功 run 则跳过（force 除外）。
  * 重试：单个 LLM 步骤失败按 retry_per_step 次指数退避重试；整个 run 失败后，
    调度器在冷却期（RETRY_COOLDOWN_SECONDS）过后自动补试，当天最多 max_daily_attempts 次。
  * 补跑：服务启动时若已过当天触发时间且当天无成功 run，catch_up 开启则立即补跑一次。
  * 互斥：RUN_LOCK 保证同一时刻只有一个 run 在执行（手动触发与定时触发互斥）。
  * 可观测：每个 run 的每一步（状态/尝试次数/错误/警告）都持久化在 data/media_workflow_runs.json。

自检（self-check）：POST /api/media-workflow/self-check 逐项校验配置、目录可写、
Key 配置、调度线程存活、画布模板结构，可选 llm_ping 做真实 LLM 连通性测试。

模块通过 init(app, main_globals) 注册，复用 main.py 的 provider 解析、画布存取等函数，
不引入新依赖。
"""

import json
import os
import re
import time
import traceback
import uuid
from threading import Lock, Thread
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel

# main.py 的全局命名空间（init 时注入），用于复用其函数与常量
M: Dict[str, Any] = {}

CONFIG_FILENAME = "media_workflow.json"
RUNS_FILENAME = "media_workflow_runs.json"
MAX_RUNS_KEPT = 200
SCHEDULER_TICK_SECONDS = 20
RETRY_COOLDOWN_SECONDS = 300
# 未开启 catch_up 时，只在触发时间之后这个窗口内补触发，避免中午开机补跑早间任务
NO_CATCHUP_WINDOW_SECONDS = 15 * 60
LLM_TIMEOUT_SECONDS = 300

MW_LOCK = Lock()          # 配置/运行记录文件读写锁
RUN_LOCK = Lock()         # 同一时刻只允许一个流水线在跑
_SCHED_THREAD: Optional[Thread] = None
_LAST_TICK_AT = 0.0

DEFAULT_CONFIG: Dict[str, Any] = {
    "enabled": False,               # 是否开启每日自动执行
    "daily_time": "07:30",          # 每天触发时间（本地时区 HH:MM）
    "topic_direction": "",          # 账号主题方向（选题的依据，必填）
    "platform": "抖音",             # 目标平台：抖音/小红书/快手/视频号/B站…
    "audience": "",                 # 目标人群（可选）
    "style_notes": "",              # 内容风格补充要求（可选）
    "llm_provider": "",             # 文案/选题使用的 LLM 平台 id
    "llm_model": "",                # LLM 模型名
    "image_provider": "",           # 生图平台 id（写入画布设置）
    "image_model": "",              # 生图模型名
    "image_ratio": "portrait",      # 画布出图比例（同智能画布的 ratio 取值）
    "image_resolution": "1k",       # 1k/2k/4k
    "image_style": "",              # 图片风格描述，会附加到每条图片提示词
    "shot_count": 4,                # 分镜数量（决定提示词/图片节点数）
    "auto_generate_images": False,  # 生成画布后是否直接由后端出图
    "catch_up": True,               # 错过触发时间后（重启/休眠）是否补跑
    "max_daily_attempts": 3,        # 当天整条流水线最多自动尝试次数
    "retry_per_step": 2,            # 单个 LLM 步骤的额外重试次数
    "project_name": "自媒体日更",   # 画布归属的项目名（不存在则自动创建）
}

# 与 static/js/smart-canvas.js 的 SIZE_MAP 保持一致，auto_generate_images 时换算尺寸
SIZE_MAP = {
    "square": {"1k": "1024x1024", "2k": "2048x2048", "4k": "4096x4096"},
    "portrait": {"1k": "1024x1536", "2k": "1360x2048", "4k": "2352x3520"},
    "portrait43": {"1k": "1008x1344", "2k": "1536x2048", "4k": "2448x3264"},
    "landscape43": {"1k": "1344x1008", "2k": "2048x1536", "4k": "3264x2448"},
    "landscape": {"1k": "1536x1024", "2k": "2048x1360", "4k": "3520x2352"},
    "story": {"1k": "720x1280", "2k": "1152x2048", "4k": "2160x3840"},
    "wide": {"1k": "1280x720", "2k": "2048x1152", "4k": "3840x2160"},
    "ultrawide": {"1k": "1280x544", "2k": "2048x880", "4k": "3840x1648"},
    "ultratall": {"1k": "544x1280", "2k": "880x2048", "4k": "1648x3840"},
}

STEP_LABELS = {
    "topic": "选题",
    "copywriting": "文案",
    "script": "分镜脚本",
    "image_prompts": "图片提示词",
    "canvas": "生成画布",
    "images": "自动出图",
}


class MediaWorkflowConfig(BaseModel):
    enabled: bool = False
    daily_time: str = "07:30"
    topic_direction: str = ""
    platform: str = "抖音"
    audience: str = ""
    style_notes: str = ""
    llm_provider: str = ""
    llm_model: str = ""
    image_provider: str = ""
    image_model: str = ""
    image_ratio: str = "portrait"
    image_resolution: str = "1k"
    image_style: str = ""
    shot_count: int = 4
    auto_generate_images: bool = False
    catch_up: bool = True
    max_daily_attempts: int = 3
    retry_per_step: int = 2
    project_name: str = "自媒体日更"


class MediaWorkflowRunRequest(BaseModel):
    force: bool = False
    offline: bool = False   # 离线模式：不调用 LLM/生图，用示例内容走完整流程（用于自检）


class MediaWorkflowSelfCheckRequest(BaseModel):
    llm_ping: bool = False  # 是否做一次真实 LLM 请求验证连通性


# ---------------------------------------------------------------------------
# 配置与运行记录存取
# ---------------------------------------------------------------------------

def _config_path() -> str:
    return os.path.join(M["DATA_DIR"], CONFIG_FILENAME)


def _runs_path() -> str:
    return os.path.join(M["DATA_DIR"], RUNS_FILENAME)


def load_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    try:
        with open(_config_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            for key in cfg:
                if key in data:
                    cfg[key] = data[key]
    except Exception:
        pass
    return _sanitize_config(cfg)


def save_config(cfg: Dict[str, Any]):
    cfg = _sanitize_config(cfg)
    with MW_LOCK:
        os.makedirs(M["DATA_DIR"], exist_ok=True)
        with open(_config_path(), "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


def _sanitize_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(cfg)
    if not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", str(out.get("daily_time") or "")):
        out["daily_time"] = DEFAULT_CONFIG["daily_time"]
    out["shot_count"] = max(1, min(9, int(out.get("shot_count") or 4)))
    out["max_daily_attempts"] = max(1, min(10, int(out.get("max_daily_attempts") or 3)))
    out["retry_per_step"] = max(0, min(5, int(out.get("retry_per_step") or 2)))
    if out.get("image_ratio") not in SIZE_MAP:
        out["image_ratio"] = DEFAULT_CONFIG["image_ratio"]
    if out.get("image_resolution") not in ("1k", "2k", "4k"):
        out["image_resolution"] = DEFAULT_CONFIG["image_resolution"]
    out["project_name"] = (str(out.get("project_name") or "").strip() or DEFAULT_CONFIG["project_name"])[:60]
    return out


def load_runs() -> List[Dict[str, Any]]:
    try:
        with open(_runs_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        runs = data.get("runs") if isinstance(data, dict) else data
        if isinstance(runs, list):
            return [r for r in runs if isinstance(r, dict)]
    except Exception:
        pass
    return []


def _save_runs(runs: List[Dict[str, Any]]):
    with MW_LOCK:
        os.makedirs(M["DATA_DIR"], exist_ok=True)
        with open(_runs_path(), "w", encoding="utf-8") as f:
            json.dump({"runs": runs[:MAX_RUNS_KEPT]}, f, ensure_ascii=False, indent=2)


def _upsert_run(record: Dict[str, Any]):
    runs = load_runs()
    for i, r in enumerate(runs):
        if r.get("id") == record.get("id"):
            runs[i] = record
            break
    else:
        runs.insert(0, record)
    _save_runs(runs)


# ---------------------------------------------------------------------------
# LLM 调用
# ---------------------------------------------------------------------------

def _call_llm(system_prompt: str, user_prompt: str, cfg: Dict[str, Any], timeout: float = LLM_TIMEOUT_SECONDS) -> str:
    provider_id = cfg.get("llm_provider") or ""
    model = cfg.get("llm_model") or ""
    base, hdrs, resolved_model = M["resolve_chat_provider"](provider_id, model, model)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    body: Dict[str, Any] = {"model": resolved_model, "messages": messages}
    try:
        provider = M["get_api_provider"](provider_id) if provider_id != "modelscope" else {}
        if provider and M["is_apimart_provider"](provider):
            body["stream"] = False
    except Exception:
        pass
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(f"{base}/chat/completions", headers=hdrs, json=body)
        resp.raise_for_status()
        raw = resp.json()
    text = M["text_from_chat_response"](raw)
    if not str(text or "").strip():
        raise RuntimeError("LLM 返回了空内容")
    return str(text).strip()


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """宽松地从 LLM 输出里抠出第一个 JSON 对象（容忍 ```json 围栏与前后废话）。"""
    if not text:
        return None
    cleaned = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).strip("` \n\r\t")
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    snippet = cleaned[start:end + 1]
    try:
        data = json.loads(snippet)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _llm_json_step(step_key: str, system_prompt: str, user_prompt: str, cfg: Dict[str, Any], step_rec: Dict[str, Any]) -> Dict[str, Any]:
    """带重试的「LLM 输出 JSON」步骤。重试用尽后抛异常，由 run 层记为失败。"""
    retries = int(cfg.get("retry_per_step") or 0)
    last_error = ""
    for attempt in range(retries + 1):
        step_rec["attempts"] = attempt + 1
        try:
            prompt = user_prompt if attempt == 0 else (
                user_prompt + "\n\n注意：上一次输出无法解析，请务必只输出一个合法的 JSON 对象，不要包含任何其他文字。"
            )
            text = _call_llm(system_prompt, prompt, cfg)
            data = _extract_json(text)
            if data is not None:
                return data
            last_error = f"输出无法解析为 JSON（前 200 字：{text[:200]}）"
        except Exception as exc:
            last_error = str(getattr(exc, "detail", None) or exc)[:500]
        if attempt < retries:
            time.sleep(min(30, 3 * (attempt + 1)))
    raise RuntimeError(f"步骤「{STEP_LABELS.get(step_key, step_key)}」失败：{last_error}")


# ---------------------------------------------------------------------------
# 流水线各步骤（选题 / 文案 / 脚本 / 图片提示词）
# ---------------------------------------------------------------------------

def _base_system_prompt(cfg: Dict[str, Any]) -> str:
    parts = [
        "你是一名资深中文自媒体内容策划与编导，输出务必具体、可执行、可拍摄。",
        f"目标平台：{cfg.get('platform') or '短视频平台'}。",
    ]
    if cfg.get("audience"):
        parts.append(f"目标人群：{cfg['audience']}。")
    if cfg.get("style_notes"):
        parts.append(f"内容风格要求：{cfg['style_notes']}。")
    parts.append("除非明确要求，回答一律只输出 JSON 对象，不要输出其他解释文字。")
    return "\n".join(parts)


def _recent_topics(limit: int = 30) -> List[str]:
    topics = []
    for r in load_runs():
        t = str(r.get("topic") or "").strip()
        if t and r.get("status") == "succeeded":
            topics.append(t)
        if len(topics) >= limit:
            break
    return topics


def _step_topic(cfg: Dict[str, Any], date_str: str, step_rec: Dict[str, Any]) -> Dict[str, Any]:
    recent = _recent_topics()
    avoid = ("\n近期已做过的选题（避免重复或高度相似）：\n- " + "\n- ".join(recent)) if recent else ""
    user = (
        f"今天是 {date_str}。请围绕账号主题方向做一个今日选题。\n"
        f"主题方向：{cfg.get('topic_direction') or '（未填写，请选普适大众话题）'}{avoid}\n\n"
        "输出 JSON：{\"topic\": \"选题标题（20字内）\", \"angle\": \"切入角度说明\", "
        "\"hook\": \"前3秒钩子文案\", \"keywords\": [\"关键词\", ...]}"
    )
    data = _llm_json_step("topic", _base_system_prompt(cfg), user, cfg, step_rec)
    if not str(data.get("topic") or "").strip():
        raise RuntimeError("选题结果缺少 topic 字段")
    return data


def _step_copywriting(cfg: Dict[str, Any], topic: Dict[str, Any], step_rec: Dict[str, Any]) -> Dict[str, Any]:
    user = (
        f"选题：{topic.get('topic')}\n切入角度：{topic.get('angle')}\n钩子：{topic.get('hook')}\n\n"
        f"请为{cfg.get('platform') or '短视频平台'}写一条完整的发布文案。\n"
        "输出 JSON：{\"title\": \"正标题\", \"alt_titles\": [\"备选标题1\", \"备选标题2\"], "
        "\"body\": \"正文文案（含分段与 emoji，符合平台风格）\", \"hashtags\": [\"#话题\", ...]}"
    )
    data = _llm_json_step("copywriting", _base_system_prompt(cfg), user, cfg, step_rec)
    if not str(data.get("title") or "").strip():
        raise RuntimeError("文案结果缺少 title 字段")
    return data


def _step_script(cfg: Dict[str, Any], topic: Dict[str, Any], copy: Dict[str, Any], step_rec: Dict[str, Any]) -> Dict[str, Any]:
    n = int(cfg.get("shot_count") or 4)
    user = (
        f"选题：{topic.get('topic')}\n文案标题：{copy.get('title')}\n\n"
        f"请写一个 {n} 个分镜的短视频口播脚本。\n"
        "输出 JSON：{\"voiceover\": \"完整口播稿\", \"shots\": ["
        "{\"no\": 1, \"scene\": \"画面内容\", \"action\": \"运镜/动作\", \"line\": \"这一段的台词\", \"duration_s\": 秒数}, ...]}\n"
        f"shots 数组必须正好 {n} 项。"
    )
    data = _llm_json_step("script", _base_system_prompt(cfg), user, cfg, step_rec)
    shots = data.get("shots")
    if not isinstance(shots, list) or not shots:
        raise RuntimeError("脚本结果缺少 shots 数组")
    data["shots"] = shots[:n]
    return data


def _step_image_prompts(cfg: Dict[str, Any], topic: Dict[str, Any], script: Dict[str, Any], step_rec: Dict[str, Any]) -> Dict[str, Any]:
    shots = script.get("shots") or []
    shot_desc = "\n".join(
        f"{i + 1}. {s.get('scene') or ''}（{s.get('action') or ''}）" for i, s in enumerate(shots)
    )
    style = str(cfg.get("image_style") or "").strip()
    style_line = f"统一风格要求：{style}\n" if style else ""
    user = (
        f"选题：{topic.get('topic')}\n分镜列表：\n{shot_desc}\n\n"
        f"{style_line}请为封面和每个分镜各写一条英文 AI 绘图提示词（适用于 DALL·E / Flux / 即梦等模型），"
        "画面具体、含构图/光线/风格描述，不出现文字排版要求。\n"
        "输出 JSON：{\"cover_prompt\": \"封面提示词\", \"shot_prompts\": [\"分镜1提示词\", ...]}\n"
        f"shot_prompts 数组必须正好 {len(shots)} 项。"
    )
    data = _llm_json_step("image_prompts", _base_system_prompt(cfg), user, cfg, step_rec)
    prompts = [str(p or "").strip() for p in (data.get("shot_prompts") or []) if str(p or "").strip()]
    if not str(data.get("cover_prompt") or "").strip():
        raise RuntimeError("提示词结果缺少 cover_prompt")
    # 数量不齐时补齐/截断，保证画布结构稳定（记为警告而不是失败）
    while len(prompts) < len(shots):
        step_rec.setdefault("warnings", []).append(f"shot_prompts 少于分镜数，第 {len(prompts) + 1} 条用封面提示词代替")
        prompts.append(str(data.get("cover_prompt")))
    data["shot_prompts"] = prompts[:len(shots)]
    if style:
        suffix = f", {style}"
        data["cover_prompt"] = str(data["cover_prompt"]).rstrip(", ") + suffix
        data["shot_prompts"] = [p.rstrip(", ") + suffix for p in data["shot_prompts"]]
    return data


def _offline_sample(cfg: Dict[str, Any], date_str: str) -> Dict[str, Any]:
    """离线示例内容：不调用任何外部接口，用于自检/演示完整链路。"""
    n = int(cfg.get("shot_count") or 4)
    shots = [
        {"no": i + 1, "scene": f"【离线示例】分镜 {i + 1} 画面描述", "action": "固定机位",
         "line": f"这是第 {i + 1} 段示例台词。", "duration_s": 5}
        for i in range(n)
    ]
    return {
        "topic": {"topic": f"【离线示例】{date_str} 今日选题", "angle": "示例切入角度",
                  "hook": "开头 3 秒示例钩子", "keywords": ["示例", "自检"]},
        "copy": {"title": "【离线示例】发布标题", "alt_titles": ["备选标题 A", "备选标题 B"],
                 "body": "这是离线自检生成的示例正文文案。\n第二段示例内容。", "hashtags": ["#示例", "#自检"]},
        "script": {"voiceover": "这是离线自检生成的完整示例口播稿。", "shots": shots},
        "prompts": {"cover_prompt": "sample cover prompt, minimal flat illustration, soft lighting",
                    "shot_prompts": [f"sample shot {i + 1} prompt, cinematic, 35mm" for i in range(n)]},
    }


# ---------------------------------------------------------------------------
# 画布生成（ComfyUI 式节点连线）
# ---------------------------------------------------------------------------

def _ensure_project_id(name: str) -> str:
    projects = M["ensure_default_project"]()
    for p in projects:
        if str(p.get("name") or "").strip() == name:
            return p["id"]
    return M["new_project"](name)["id"]


def _prompt_node(node_id: str, x: float, y: float, title: str, text: str, w: int = 440, h: int = 320) -> Dict[str, Any]:
    return {
        "id": node_id, "type": "smart-prompt", "x": x, "y": y, "w": w, "h": h,
        "title": title, "text": text, "promptSeparator": ";", "promptSplitEnabled": False,
        "llmEnabled": False, "llmProvider": "", "llmModel": "",
        "llmSystemEnabled": False, "llmSystemPrompt": "", "llmInstruction": "",
        "created_at": M["now_ms"](), "images": [], "scale": 1,
    }


def _image_node(node_id: str, x: float, y: float, title: str, images: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    return {
        "id": node_id, "type": "smart-image", "x": x, "y": y,
        "title": title, "images": images or [], "scale": 1, "created_at": M["now_ms"](),
    }


def _format_topic_text(topic: Dict[str, Any]) -> str:
    kw = "、".join(str(k) for k in (topic.get("keywords") or []))
    return (f"选题：{topic.get('topic')}\n\n切入角度：{topic.get('angle')}\n\n"
            f"开头钩子：{topic.get('hook')}\n\n关键词：{kw}")


def _format_copy_text(copy: Dict[str, Any]) -> str:
    alts = "\n".join(f"  - {t}" for t in (copy.get("alt_titles") or []))
    tags = " ".join(str(t) for t in (copy.get("hashtags") or []))
    return (f"标题:{copy.get('title')}\n\n备选标题：\n{alts}\n\n正文：\n{copy.get('body')}\n\n话题：{tags}")


def _format_script_text(script: Dict[str, Any]) -> str:
    lines = []
    for s in script.get("shots") or []:
        lines.append(f"分镜 {s.get('no')}｜{s.get('duration_s')}s\n画面:{s.get('scene')}\n"
                     f"运镜:{s.get('action')}\n台词:{s.get('line')}")
    return f"完整口播稿：\n{script.get('voiceover')}\n\n" + "\n\n".join(lines)


def build_canvas_payload(cfg: Dict[str, Any], date_str: str, content: Dict[str, Any]) -> Dict[str, Any]:
    """把一天的内容组装成 smart 画布 JSON（不落盘，便于自检复用）。"""
    topic, copy = content["topic"], content["copy"]
    script, prompts = content["script"], content["prompts"]
    shots = script.get("shots") or []
    col = 560          # 列间距
    row = 470          # 分镜行间距
    nodes: List[Dict[str, Any]] = [
        _prompt_node("mw_topic", 0, 0, "01 今日选题", _format_topic_text(topic)),
        _prompt_node("mw_copy", col, 0, "02 发布文案", _format_copy_text(copy), h=380),
        _prompt_node("mw_script", col * 2, 0, "03 口播与分镜脚本", _format_script_text(script), h=420),
        _prompt_node("mw_cover_prompt", col * 3, -row, "04 封面提示词", str(prompts.get("cover_prompt") or ""), h=260),
        _image_node("mw_cover_image", col * 4, -row, "05 封面图"),
    ]
    connections: List[Dict[str, Any]] = [
        {"from": "mw_topic", "to": "mw_copy", "kind": "input"},
        {"from": "mw_copy", "to": "mw_script", "kind": "input"},
        {"from": "mw_copy", "to": "mw_cover_prompt", "kind": "input"},
        {"from": "mw_cover_prompt", "to": "mw_cover_image", "kind": "input"},
    ]
    shot_prompts = prompts.get("shot_prompts") or []
    for i in range(len(shots)):
        pid, iid = f"mw_shot_prompt_{i + 1}", f"mw_shot_image_{i + 1}"
        text = shot_prompts[i] if i < len(shot_prompts) else ""
        nodes.append(_prompt_node(pid, col * 3, i * row, f"04-{i + 1} 分镜{i + 1}提示词", text, h=260))
        nodes.append(_image_node(iid, col * 4, i * row, f"05-{i + 1} 分镜{i + 1}配图"))
        connections.append({"from": "mw_script", "to": pid, "kind": "input"})
        connections.append({"from": pid, "to": iid, "kind": "input"})
    settings = {
        "engine": "api", "apiKind": "image",
        "provider_id": cfg.get("image_provider") or "",
        "model": cfg.get("image_model") or "",
        "ratio": cfg.get("image_ratio") or "portrait",
        "resolution": cfg.get("image_resolution") or "1k",
        "quality": "auto", "count": 1,
    }
    title = f"{date_str} {cfg.get('platform') or ''}日更 · {str(topic.get('topic') or '')[:24]}"
    return {"title": title[:80], "nodes": nodes, "connections": connections, "settings": settings,
            "viewport": {"x": 80, "y": 320, "scale": 0.42}}


def _create_canvas(cfg: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    ts = M["now_ms"]()
    canvas = {
        "id": uuid.uuid4().hex,
        "title": payload["title"],
        "icon": "clapperboard",
        "kind": "smart",
        "owner": "", "color": "violet", "pinned": False,
        "project": _ensure_project_id(cfg.get("project_name") or DEFAULT_CONFIG["project_name"]),
        "created_at": ts, "updated_at": ts,
        "nodes": payload["nodes"],
        "connections": payload["connections"],
        "viewport": payload["viewport"],
        "logs": [], "settings": payload["settings"],
    }
    M["save_canvas"](canvas)
    return canvas


def _auto_generate_images(cfg: Dict[str, Any], canvas: Dict[str, Any], step_rec: Dict[str, Any]):
    """可选：直接在后端为每个提示词节点出图，结果写回对应图片节点。"""
    import asyncio
    loop = M["_main_globals"].get("GLOBAL_LOOP") if M.get("_main_globals") else None
    if loop is None:
        raise RuntimeError("服务事件循环未就绪，无法自动出图（画布已生成，可手动运行）")
    size = SIZE_MAP.get(cfg.get("image_ratio") or "portrait", SIZE_MAP["portrait"]).get(
        cfg.get("image_resolution") or "1k", "1024x1536")
    pairs = []  # (提示词节点, 图片节点)
    node_by_id = {n["id"]: n for n in canvas["nodes"]}
    for conn in canvas["connections"]:
        src, dst = node_by_id.get(conn.get("from")), node_by_id.get(conn.get("to"))
        if src and dst and src.get("type") == "smart-prompt" and dst.get("type") == "smart-image" and str(src.get("text") or "").strip():
            pairs.append((src, dst))
    ok = 0
    for src, dst in pairs:
        req = M["OnlineImageRequest"](
            prompt=str(src.get("text") or "").strip(),
            provider_id=cfg.get("image_provider") or "",
            model=cfg.get("image_model") or "",
            size=size, quality="auto", n=1,
        )
        try:
            future = asyncio.run_coroutine_threadsafe(M["build_online_image_result"](req), loop)
            result = future.result(timeout=900)
            items = result.get("image_items") or [{"url": u, "kind": "image"} for u in (result.get("images") or [])]
            if items:
                dst["images"] = items
                ok += 1
            else:
                step_rec.setdefault("warnings", []).append(f"{dst.get('title')}：接口未返回图片")
        except Exception as exc:
            detail = str(getattr(exc, "detail", None) or exc)[:300]
            step_rec.setdefault("warnings", []).append(f"{dst.get('title')}：{detail}")
    M["save_canvas"](canvas)
    if ok == 0 and pairs:
        raise RuntimeError("所有图片都生成失败（画布与提示词已生成，可打开画布手动运行）")
    step_rec["detail"] = f"成功 {ok}/{len(pairs)} 张"


# ---------------------------------------------------------------------------
# Run 流水线
# ---------------------------------------------------------------------------

def _today_str(ts: Optional[float] = None) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(ts or time.time()))


def run_pipeline(trigger: str, force: bool = False, offline: bool = False) -> Dict[str, Any]:
    """执行一次完整流水线。返回 run 记录。"""
    if not RUN_LOCK.acquire(blocking=False):
        return {"status": "busy", "error": "已有任务在执行中"}
    try:
        cfg = load_config()
        date_str = _today_str()
        if not force:
            for r in load_runs():
                if r.get("date") == date_str and r.get("status") == "succeeded":
                    return {"status": "skipped", "date": date_str, "error": "今天已成功执行过（force 可强制重跑）"}
        run: Dict[str, Any] = {
            "id": uuid.uuid4().hex, "date": date_str, "trigger": trigger,
            "offline": bool(offline), "status": "running",
            "started_at": M["now_ms"](), "finished_at": 0,
            "canvas_id": "", "canvas_url": "", "topic": "",
            "steps": [], "error": "",
        }
        _upsert_run(run)

        def step(key: str) -> Dict[str, Any]:
            rec = {"key": key, "label": STEP_LABELS.get(key, key), "status": "running", "attempts": 0}
            run["steps"].append(rec)
            _upsert_run(run)
            return rec

        def done(rec: Dict[str, Any]):
            rec["status"] = "succeeded"
            _upsert_run(run)

        try:
            if offline:
                content = _offline_sample(cfg, date_str)
                for key in ("topic", "copywriting", "script", "image_prompts"):
                    rec = step(key)
                    rec["attempts"] = 1
                    done(rec)
            else:
                if not (cfg.get("llm_provider") or "").strip():
                    raise RuntimeError("尚未配置 LLM 平台（llm_provider），请先在管理页保存配置")
                rec = step("topic")
                topic = _step_topic(cfg, date_str, rec)
                run["topic"] = str(topic.get("topic") or "")
                done(rec)
                rec = step("copywriting")
                copy = _step_copywriting(cfg, topic, rec)
                done(rec)
                rec = step("script")
                script = _step_script(cfg, topic, copy, rec)
                done(rec)
                rec = step("image_prompts")
                prompts = _step_image_prompts(cfg, topic, script, rec)
                done(rec)
                content = {"topic": topic, "copy": copy, "script": script, "prompts": prompts}
            run["topic"] = run["topic"] or str(content["topic"].get("topic") or "")

            rec = step("canvas")
            payload = build_canvas_payload(cfg, date_str, content)
            canvas = _create_canvas(cfg, payload)
            run["canvas_id"] = canvas["id"]
            run["canvas_url"] = f"/static/smart-canvas.html?id={canvas['id']}"
            rec["attempts"] = 1
            done(rec)

            if cfg.get("auto_generate_images") and not offline:
                rec = step("images")
                rec["attempts"] = 1
                _auto_generate_images(cfg, canvas, rec)
                done(rec)

            run["status"] = "succeeded"
        except Exception as exc:
            run["status"] = "failed"
            run["error"] = str(getattr(exc, "detail", None) or exc)[:800]
            for rec in run["steps"]:
                if rec.get("status") == "running":
                    rec["status"] = "failed"
                    rec["error"] = run["error"]
            traceback.print_exc()
        run["finished_at"] = M["now_ms"]()
        _upsert_run(run)
        return run
    finally:
        RUN_LOCK.release()


# ---------------------------------------------------------------------------
# 每日调度器
# ---------------------------------------------------------------------------

def _scheduled_ts_today(cfg: Dict[str, Any]) -> float:
    hh, mm = str(cfg.get("daily_time") or "07:30").split(":")
    lt = time.localtime()
    return time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, int(hh), int(mm), 0, 0, 0, -1))


def next_run_at(cfg: Dict[str, Any]) -> int:
    """下一次自动触发的时间戳（ms）；未启用返回 0。"""
    if not cfg.get("enabled"):
        return 0
    sched = _scheduled_ts_today(cfg)
    date_str = _today_str()
    succeeded_today = any(r.get("date") == date_str and r.get("status") == "succeeded" for r in load_runs())
    if time.time() < sched and not succeeded_today:
        return int(sched * 1000)
    return int((sched + 86400) * 1000)


def _scheduler_tick():
    cfg = load_config()
    if not cfg.get("enabled"):
        return
    now = time.time()
    sched = _scheduled_ts_today(cfg)
    if now < sched:
        return
    if not cfg.get("catch_up") and now > sched + NO_CATCHUP_WINDOW_SECONDS:
        return
    date_str = _today_str()
    attempts, last_finished = 0, 0
    for r in load_runs():
        if r.get("date") != date_str:
            continue
        if r.get("status") == "succeeded":
            return
        if r.get("status") == "running":
            return
        if r.get("trigger") in ("schedule", "catchup") and r.get("status") == "failed":
            attempts += 1
            last_finished = max(last_finished, int(r.get("finished_at") or 0))
    if attempts >= int(cfg.get("max_daily_attempts") or 3):
        return
    if last_finished and (now - last_finished / 1000) < RETRY_COOLDOWN_SECONDS:
        return
    trigger = "schedule" if now - sched < SCHEDULER_TICK_SECONDS * 3 else "catchup"
    print(f"[media-workflow] {date_str} 触发每日流水线（{trigger}，第 {attempts + 1} 次尝试）")
    run_pipeline(trigger)


def _scheduler_loop():
    global _LAST_TICK_AT
    while True:
        try:
            _LAST_TICK_AT = time.time()
            _scheduler_tick()
        except Exception:
            traceback.print_exc()
        time.sleep(SCHEDULER_TICK_SECONDS)


# ---------------------------------------------------------------------------
# 自检
# ---------------------------------------------------------------------------

def run_self_check(llm_ping: bool = False) -> Dict[str, Any]:
    cfg = load_config()
    items: List[Dict[str, Any]] = []

    def add(key: str, label: str, status: str, detail: str = ""):
        items.append({"key": key, "label": label, "status": status, "detail": detail})

    # 1. 配置合法性
    problems = []
    if cfg.get("enabled") and not str(cfg.get("topic_direction") or "").strip():
        problems.append("已启用但未填写主题方向")
    if not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", str(cfg.get("daily_time") or "")):
        problems.append("每日时间格式不合法")
    add("config", "配置合法性", "fail" if problems else "pass", "；".join(problems))

    # 2. 数据目录可写
    try:
        probe = os.path.join(M["CANVAS_DIR"], f"__mw_probe_{uuid.uuid4().hex[:8]}.tmp")
        os.makedirs(M["CANVAS_DIR"], exist_ok=True)
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        add("storage", "画布目录可写", "pass", M["CANVAS_DIR"])
    except Exception as exc:
        add("storage", "画布目录可写", "fail", str(exc)[:200])

    # 3. LLM 平台与 Key
    lp = str(cfg.get("llm_provider") or "").strip()
    if not lp:
        add("llm_provider", "LLM 平台配置", "fail", "未选择 LLM 平台")
    else:
        try:
            key = (M["modelscope_api_key"]() if lp == "modelscope" else M["provider_env_key_value"](lp))
            if key:
                add("llm_provider", "LLM 平台配置", "pass", f"{lp} / {cfg.get('llm_model') or '默认模型'}")
            else:
                add("llm_provider", "LLM 平台配置", "fail", f"{lp} 未配置 API Key（到 API 设置页填写）")
        except Exception as exc:
            add("llm_provider", "LLM 平台配置", "fail", str(exc)[:200])

    # 4. 生图平台与 Key（未开自动出图时仅警告）
    ip = str(cfg.get("image_provider") or "").strip()
    need = bool(cfg.get("auto_generate_images"))
    if not ip:
        add("image_provider", "生图平台配置", "fail" if need else "warn",
            "未选择生图平台" + ("" if need else "（画布内手动生图也需要，建议配置）"))
    else:
        try:
            key = (M["modelscope_api_key"]() if ip == "modelscope" else M["provider_env_key_value"](ip))
            add("image_provider", "生图平台配置", "pass" if key else ("fail" if need else "warn"),
                f"{ip} / {cfg.get('image_model') or '默认模型'}" + ("" if key else "，未配置 API Key"))
        except Exception as exc:
            add("image_provider", "生图平台配置", "fail" if need else "warn", str(exc)[:200])

    # 5. 调度线程存活
    alive = bool(_SCHED_THREAD and _SCHED_THREAD.is_alive())
    tick_age = (time.time() - _LAST_TICK_AT) if _LAST_TICK_AT else -1
    add("scheduler", "调度线程存活", "pass" if alive else "fail",
        f"最近心跳 {int(tick_age)}s 前" if alive and tick_age >= 0 else ("线程未运行" if not alive else ""))

    # 6. 运行记录可读写
    try:
        runs = load_runs()
        _save_runs(runs)
        add("runs_store", "运行记录读写", "pass", f"已有 {len(runs)} 条记录")
    except Exception as exc:
        add("runs_store", "运行记录读写", "fail", str(exc)[:200])

    # 7. 画布模板结构（离线组装 + 结构校验，不落盘）
    try:
        payload = build_canvas_payload(cfg, _today_str(), _offline_sample(cfg, _today_str()))
        ids = [n["id"] for n in payload["nodes"]]
        assert len(ids) == len(set(ids)), "节点 id 重复"
        for c in payload["connections"]:
            assert c["from"] in ids and c["to"] in ids, f"连线引用了不存在的节点：{c}"
        n_img = sum(1 for n in payload["nodes"] if n["type"] == "smart-image")
        add("canvas_template", "画布模板结构", "pass",
            f"{len(payload['nodes'])} 节点 / {len(payload['connections'])} 连线 / {n_img} 个图片节点")
    except Exception as exc:
        add("canvas_template", "画布模板结构", "fail", str(exc)[:200])

    # 8. 可选：真实 LLM 连通性
    if llm_ping:
        try:
            text = _call_llm("你是连通性自检助手。", "请只回复两个字：正常", cfg, timeout=60)
            add("llm_ping", "LLM 连通性", "pass", f"返回：{text[:60]}")
        except Exception as exc:
            add("llm_ping", "LLM 连通性", "fail", str(getattr(exc, 'detail', None) or exc)[:300])

    overall = "pass"
    if any(i["status"] == "fail" for i in items):
        overall = "fail"
    elif any(i["status"] == "warn" for i in items):
        overall = "warn"
    return {"overall": overall, "items": items, "checked_at": M["now_ms"]()}


# ---------------------------------------------------------------------------
# 注册（main.py 调用）
# ---------------------------------------------------------------------------

def init(app, main_globals: Dict[str, Any]):
    global _SCHED_THREAD
    M.update({k: main_globals[k] for k in (
        "DATA_DIR", "CANVAS_DIR", "now_ms", "save_canvas",
        "ensure_default_project", "new_project",
        "resolve_chat_provider", "text_from_chat_response",
        "get_api_provider", "is_apimart_provider",
        "provider_env_key_value", "modelscope_api_key",
        "OnlineImageRequest", "build_online_image_result",
    )})
    # GLOBAL_LOOP 在 startup 事件里才赋值，保存 main 命名空间引用、用到时再取
    M["_main_globals"] = main_globals

    @app.get("/api/media-workflow/config")
    async def mw_get_config():
        return {"config": load_config()}

    @app.put("/api/media-workflow/config")
    async def mw_put_config(payload: MediaWorkflowConfig):
        cfg = save_config(payload.dict())
        return {"config": cfg, "next_run_at": next_run_at(cfg)}

    @app.get("/api/media-workflow/status")
    async def mw_status():
        cfg = load_config()
        date_str = _today_str()
        today = {"date": date_str, "status": "idle", "attempts": 0}
        for r in load_runs():
            if r.get("date") != date_str:
                continue
            today["attempts"] += 1
            if r.get("status") == "succeeded" and today["status"] != "succeeded":
                today["status"] = "succeeded"
            elif r.get("status") == "running" and today["status"] == "idle":
                today["status"] = "running"
            elif today["status"] == "idle":
                today["status"] = r.get("status") or "idle"
        runs = load_runs()
        return {
            "enabled": bool(cfg.get("enabled")),
            "scheduler_alive": bool(_SCHED_THREAD and _SCHED_THREAD.is_alive()),
            "next_run_at": next_run_at(cfg),
            "running": RUN_LOCK.locked(),
            "today": today,
            "last_run": runs[0] if runs else None,
        }

    @app.get("/api/media-workflow/runs")
    async def mw_runs(limit: int = 30):
        return {"runs": load_runs()[:max(1, min(MAX_RUNS_KEPT, limit))]}

    @app.post("/api/media-workflow/run")
    async def mw_run(payload: MediaWorkflowRunRequest):
        if RUN_LOCK.locked():
            return {"started": False, "message": "已有任务在执行中，请稍候"}
        Thread(target=run_pipeline, args=("manual",),
               kwargs={"force": payload.force, "offline": payload.offline}, daemon=True).start()
        return {"started": True, "message": "已开始执行，进度见运行记录"}

    @app.post("/api/media-workflow/self-check")
    async def mw_self_check(payload: MediaWorkflowSelfCheckRequest):
        import asyncio
        return await asyncio.to_thread(run_self_check, payload.llm_ping)

    _SCHED_THREAD = Thread(target=_scheduler_loop, daemon=True, name="media-workflow-scheduler")
    _SCHED_THREAD.start()
    print("[media-workflow] 模块已注册，每日调度线程已启动")
