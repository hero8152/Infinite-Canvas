"""Pure contracts, routing and prompts for the e-commerce image workspace."""

from __future__ import annotations

import json
import re
from typing import Any, Iterable


OPERATIONS = (
    "try_on",
    "pose_transfer",
    "prop_replace",
    "angle_change",
    "background_change",
    "universal",
)
MODES = ("standard",)
LEGACY_MODES = {"preview", "publish"}
ASPECT_RATIOS = ("source", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "9:16", "16:9")
RESOLUTIONS = ("auto", "1k", "2k", "4k")
QUALITIES = ("auto", "low", "medium", "high")

SIZE_PRESETS: dict[str, dict[str, str]] = {
    "1:1": {"1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880"},
    "2:3": {"1k": "1024x1536", "2k": "1360x2040", "4k": "2304x3456"},
    "3:2": {"1k": "1536x1024", "2k": "2040x1360", "4k": "3456x2304"},
    "3:4": {"1k": "1008x1344", "2k": "1536x2048", "4k": "2400x3200"},
    "4:3": {"1k": "1344x1008", "2k": "2048x1536", "4k": "3200x2400"},
    "4:5": {"1k": "1024x1280", "2k": "1632x2040", "4k": "2560x3200"},
    "9:16": {"1k": "720x1280", "2k": "1152x2048", "4k": "2160x3840"},
    "16:9": {"1k": "1280x720", "2k": "2048x1152", "4k": "3840x2160"},
}

OPERATION_INPUTS: dict[str, tuple[str, ...]] = {
    "try_on": ("source", "garment"),
    "pose_transfer": ("source",),
    "prop_replace": ("source", "prop"),
    "angle_change": ("source",),
    "background_change": ("source",),
    "universal": (),
}
UNIVERSAL_REFERENCE_LIMIT = 14
UNIVERSAL_REFERENCE_ROLES = [
    {"id": "subject", "label": {"zh": "主体/模特", "en": "Subject / model"}},
    {"id": "upper_garment", "label": {"zh": "上装", "en": "Upper garment"}},
    {"id": "lower_garment", "label": {"zh": "下装", "en": "Lower garment"}},
    {"id": "full_garment", "label": {"zh": "连衣裙/套装", "en": "Dress / full outfit"}},
    {"id": "shoes", "label": {"zh": "鞋靴", "en": "Shoes"}},
    {"id": "accessory", "label": {"zh": "首饰/配饰", "en": "Accessory"}},
    {"id": "prop", "label": {"zh": "道具/商品", "en": "Prop / product"}},
    {"id": "pose", "label": {"zh": "动作参考", "en": "Pose reference"}},
    {"id": "scene", "label": {"zh": "场景/背景", "en": "Scene / background"}},
    {"id": "style", "label": {"zh": "风格/光影", "en": "Style / lighting"}},
]
UNIVERSAL_REFERENCE_ROLE_IDS = {item["id"] for item in UNIVERSAL_REFERENCE_ROLES}
ALLOWED_INPUT_ROLES = {"source", "garment", "pose", "prop", "background", "mask", *UNIVERSAL_REFERENCE_ROLE_IDS}
UNIVERSAL_INTERACTIONS = {"wear", "put_on", "hold", "carry", "place", "use", "pose", "scene", "style", "identity"}
ACCESSORY_WEAR_KEYWORDS = (
    "necklace", "项链", "earring", "耳环", "bracelet", "手链", "bangle", "手镯", "ring", "戒指",
    "watch", "手表", "hat", "帽", "cap", "glasses", "眼镜", "sunglasses", "墨镜", "belt", "腰带",
    "scarf", "围巾", "brooch", "胸针", "tie", "领带",
)
HANDHELD_KEYWORDS = (
    "phone", "手机", "smartphone", "camera", "相机", "cup", "杯", "bottle", "瓶", "book", "书",
    "umbrella", "伞", "flower", "花", "wallet", "钱包", "card", "卡", "cosmetic", "口红", "lipstick",
)
BAG_KEYWORDS = ("bag", "包", "handbag", "tote", "clutch", "purse", "satchel", "backpack", "shoulder bag", "手提包", "托特包", "双肩包", "挎包")
PLACED_PROP_KEYWORDS = ("chair", "椅", "sofa", "沙发", "table", "桌", "vase", "花瓶", "lamp", "灯", "plant", "植物", "furniture", "家具", "decor", "摆件")

POSE_PRESETS = [
    {"id": "standing_front", "label": {"zh": "正面站立", "en": "Front standing"}, "prompt": "standing upright, front view, arms relaxed naturally"},
    {"id": "standing_three_quarter", "label": {"zh": "四分之三站姿", "en": "Three-quarter"}, "prompt": "three-quarter standing pose with a natural weight shift"},
    {"id": "side_profile", "label": {"zh": "侧身站立", "en": "Side profile"}, "prompt": "clean side-profile standing pose"},
    {"id": "walking", "label": {"zh": "自然行走", "en": "Walking"}, "prompt": "natural mid-step walking pose with realistic balance"},
    {"id": "sitting", "label": {"zh": "自然坐姿", "en": "Sitting"}, "prompt": "natural seated pose with anatomically correct limbs"},
    {"id": "arms_crossed", "label": {"zh": "双臂交叉", "en": "Arms crossed"}, "prompt": "standing with arms crossed naturally"},
    {"id": "hand_on_hip", "label": {"zh": "单手叉腰", "en": "Hand on hip"}, "prompt": "standing with one hand on the hip, confident catalog pose"},
    {"id": "product_hold", "label": {"zh": "手持商品", "en": "Holding product"}, "prompt": "balanced standing pose holding a product naturally at chest level"},
]

BACKGROUND_PRESETS = [
    {"id": "studio_white", "label": {"zh": "纯白棚拍", "en": "White studio"}, "prompt": "seamless pure white e-commerce studio background, soft grounded shadow"},
    {"id": "studio_gray", "label": {"zh": "中性灰棚拍", "en": "Gray studio"}, "prompt": "neutral light-gray studio cyclorama, soft commercial lighting"},
    {"id": "warm_minimal", "label": {"zh": "暖色极简", "en": "Warm minimal"}, "prompt": "warm minimal beige set, refined natural materials, soft daylight"},
    {"id": "luxury_dark", "label": {"zh": "深色奢华", "en": "Luxury dark"}, "prompt": "premium dark studio set with controlled highlights and elegant reflections"},
    {"id": "home_lifestyle", "label": {"zh": "居家生活", "en": "Home lifestyle"}, "prompt": "tasteful modern home lifestyle scene, natural window light"},
    {"id": "outdoor_daylight", "label": {"zh": "户外日光", "en": "Outdoor daylight"}, "prompt": "clean outdoor lifestyle scene in soft natural daylight"},
    {"id": "festival_red", "label": {"zh": "节庆红金", "en": "Festive red"}, "prompt": "refined festive red and gold commercial set, tasteful and uncluttered"},
    {"id": "transparent_style", "label": {"zh": "透明底观感", "en": "Cutout style"}, "prompt": "isolated clean catalog presentation with no visible environment and a subtle contact shadow"},
]

QUALITY_CHECKS: dict[str, list[dict[str, Any]]] = {
    "try_on": [
        {"id": "identity", "label": {"zh": "人物脸部、发型、体型和肤色与原图一致", "en": "Face, hair, body shape, and skin tone match the source"}},
        {"id": "garment", "label": {"zh": "服装版型、颜色、面料、图案、Logo 和文字准确", "en": "Garment cut, color, fabric, pattern, logo, and text are accurate"}},
        {"id": "anatomy", "label": {"zh": "四肢、手指、衣褶和遮挡关系自然", "en": "Limbs, fingers, folds, and occlusions look natural"}},
        {"id": "background", "label": {"zh": "姿态、镜头、光线和背景未被意外修改", "en": "Pose, camera, lighting, and background were not changed unexpectedly"}},
        {"id": "artifacts", "label": {"zh": "放大检查后无破损、重影、水印或额外物体", "en": "No damage, ghosting, watermark, or extra objects at full size"}},
    ],
    "pose_transfer": [
        {"id": "identity", "label": {"zh": "人物身份、脸部和体型保持一致", "en": "Identity, face, and body shape are preserved"}},
        {"id": "outfit", "label": {"zh": "原服装、配饰、图案和文字保持一致", "en": "Original outfit, accessories, patterns, and text are preserved"}},
        {"id": "pose", "label": {"zh": "目标动作迁移正确且重心合理", "en": "Target pose is transferred with believable balance"}},
        {"id": "anatomy", "label": {"zh": "关节、手脚和遮挡关系符合人体结构", "en": "Joints, hands, feet, and occlusions are anatomically valid"}},
        {"id": "scene", "label": {"zh": "背景、镜头与光线没有非预期变化", "en": "Background, camera, and lighting have no unintended changes"}},
    ],
    "prop_replace": [
        {"id": "prop", "label": {"zh": "新道具的造型、材质、颜色、Logo 和文字准确", "en": "New prop shape, material, color, logo, and text are accurate"}},
        {"id": "placement", "label": {"zh": "尺寸、透视、握持或接触关系合理", "en": "Scale, perspective, grip, and contact are believable"}},
        {"id": "lighting", "label": {"zh": "道具光线、阴影和反射与场景匹配", "en": "Lighting, shadow, and reflections match the scene"}},
        {"id": "preservation", "label": {"zh": "替换区域以外的人物、商品和背景保持不变", "en": "People, products, and background outside the target are preserved"}},
        {"id": "artifacts", "label": {"zh": "边缘自然，无残留旧道具、重影或水印", "en": "Edges are clean with no old prop remnants, ghosting, or watermark"}},
    ],
    "angle_change": [
        {"id": "identity", "label": {"zh": "主体身份、商品结构和比例保持一致", "en": "Subject identity, product structure, and proportions are preserved"}},
        {"id": "details", "label": {"zh": "颜色、材质、Logo、文字与关键细节准确", "en": "Color, material, logo, text, and key details are accurate"}},
        {"id": "view", "label": {"zh": "水平角、俯仰角和景别符合选择", "en": "Azimuth, elevation, and distance match the controls"}},
        {"id": "geometry", "label": {"zh": "新露出的表面合理，无镜像、复制或结构畸变", "en": "Newly revealed surfaces are plausible with no mirroring or deformation"}},
        {"id": "scene", "label": {"zh": "非目标场景、光线和背景保持一致", "en": "Non-target scene, lighting, and background remain consistent"}},
    ],
    "background_change": [
        {"id": "foreground", "label": {"zh": "人物或商品主体、Logo、文字和颜色保持准确", "en": "Foreground subject, logo, text, and color remain accurate"}},
        {"id": "edges", "label": {"zh": "头发、透明材质和商品边缘无白边或缺损", "en": "Hair, transparent materials, and edges have no halos or damage"}},
        {"id": "scene", "label": {"zh": "背景内容符合所选模板、描述或参考图", "en": "Background matches the selected preset, prompt, or reference"}},
        {"id": "lighting", "label": {"zh": "接触阴影、反射、景深和光线方向自然", "en": "Contact shadow, reflections, depth, and light direction are natural"}},
        {"id": "artifacts", "label": {"zh": "无额外主体、文字、水印或明显生成瑕疵", "en": "No extra subjects, text, watermark, or visible generation defects"}},
    ],
    "universal": [
        {"id": "identity", "label": {"zh": "主体身份、脸部、发型、体型和肤色只来自主体参考图", "en": "Identity, face, hair, body shape, and skin tone come only from subject references"}},
        {"id": "products", "label": {"zh": "服装、鞋、配饰和道具的版型、材质、颜色、Logo 与文字准确", "en": "Garments, shoes, accessories, and props preserve shape, material, color, logos, and text"}},
        {"id": "pose", "label": {"zh": "动作只迁移姿态与关节关系，人体结构和重心自然", "en": "Pose transfers only posture and joints with natural anatomy and balance"}},
        {"id": "scene", "label": {"zh": "场景构图、光线、透视和接触阴影协调", "en": "Scene composition, lighting, perspective, and contact shadows are coherent"}},
        {"id": "ownership", "label": {"zh": "各参考图没有串脸、串服装、串背景或复制无关物体", "en": "References do not leak identity, clothing, backgrounds, or unrelated objects"}},
        {"id": "artifacts", "label": {"zh": "放大检查后无重影、畸形肢体、镜像文字、水印或多余物体", "en": "No ghosting, malformed limbs, mirrored text, watermark, or extra objects at full size"}},
    ],
}

EDIT_MODEL_HINTS = (
    "qwen-image-edit",
    "flux.2-klein",
    "flux2-klein",
    "nano-banana",
    "gpt-image",
    "gemini-3-pro-image",
    "gemini-3.1-flash-image",
)
STANDARD_PRIORITIES = ("gemini-3-pro-image-preview", "gpt-image-2-vip", "nano-banana-pro-4k-vip", "qwen-image-edit-2511")

GARMENT_CATEGORY_ALIASES = {
    "upper": "upper",
    "upper_body": "upper",
    "upper-body": "upper",
    "top": "upper",
    "tops": "upper",
    "上装": "upper",
    "上衣": "upper",
    "lower": "lower",
    "lower_body": "lower",
    "lower-body": "lower",
    "bottom": "lower",
    "bottoms": "lower",
    "下装": "lower",
    "裤装": "lower",
    "裙装": "lower",
    "dress": "dress",
    "one-piece": "dress",
    "one_piece": "dress",
    "连衣裙": "dress",
    "连体衣": "dress",
}


def validate_operation(value: str) -> str:
    operation = str(value or "").strip().lower()
    if operation not in OPERATIONS:
        raise ValueError("不支持的电商功能")
    return operation


def validate_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    if mode in LEGACY_MODES:
        return "standard"
    if mode not in MODES:
        raise ValueError("生成模式只能是 standard")
    return "standard"


def normalize_garment_analysis(value: dict[str, Any] | None) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    raw_category = str(data.get("category") or data.get("garment_category") or "").strip().lower()
    category = GARMENT_CATEGORY_ALIASES.get(raw_category, "auto")
    garment_type = re.sub(r"\s+", " ", str(data.get("garment_type") or data.get("type") or "").strip())[:120]
    reason = re.sub(r"\s+", " ", str(data.get("reason") or "").strip())[:240]
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence") or 0)))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "category": category,
        "garment_type": garment_type,
        "confidence": round(confidence, 4),
        "reason": reason,
    }


def parse_garment_analysis(text: str) -> dict[str, Any]:
    value = str(text or "").strip()
    value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE).strip()
    value = re.sub(r"\s*```$", "", value).strip()
    try:
        data = json.loads(value)
    except Exception:
        match = re.search(r"\{.*?\}", value, re.S)
        data = json.loads(match.group(0)) if match else {}
    return normalize_garment_analysis(data)


def normalize_universal_reference_analysis(value: dict[str, Any] | None) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    item_name = re.sub(r"\s+", " ", str(data.get("item_name") or data.get("name") or "").strip())[:120]
    category = re.sub(r"\s+", " ", str(data.get("category") or data.get("type") or "").strip())[:80]
    interaction = str(data.get("interaction") or "").strip().lower()
    if interaction not in UNIVERSAL_INTERACTIONS:
        interaction = ""
    placement = re.sub(r"\s+", " ", str(data.get("placement") or "").strip())[:160]
    visual_details = re.sub(r"\s+", " ", str(data.get("visual_details") or data.get("details") or "").strip())[:300]
    reason = re.sub(r"\s+", " ", str(data.get("reason") or "").strip())[:240]
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence") or 0)))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "item_name": item_name,
        "category": category,
        "interaction": interaction,
        "placement": placement,
        "visual_details": visual_details,
        "confidence": round(confidence, 4),
        "reason": reason,
    }


def parse_universal_reference_analysis(text: str) -> dict[str, Any]:
    value = str(text or "").strip()
    value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE).strip()
    value = re.sub(r"\s*```$", "", value).strip()
    try:
        data = json.loads(value)
    except Exception:
        match = re.search(r"\{.*?\}", value, re.S)
        data = json.loads(match.group(0)) if match else {}
    return normalize_universal_reference_analysis(data)


def is_compatible_edit_model(model: str) -> bool:
    value = str(model or "").strip().lower()
    return bool(value and any(hint in value for hint in EDIT_MODEL_HINTS))


def build_model_catalog(providers: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for provider_index, provider in enumerate(providers or []):
        if not isinstance(provider, dict) or not provider.get("enabled", True):
            continue
        provider_id = str(provider.get("id") or "").strip().lower()
        if not provider_id:
            continue
        for model_index, model in enumerate(provider.get("image_models") or []):
            model_name = str(model or "").strip()
            if not is_compatible_edit_model(model_name):
                continue
            low = model_name.lower()
            if "gemini-3" in low or "nano-banana-pro" in low or "nano-banana-2" in low:
                max_reference_images = 14
            elif "gemini-2.5" in low or low in {"nano-banana", "nano-banana-fast"}:
                max_reference_images = 3
            else:
                max_reference_images = 10
            catalog.append({
                "provider_id": provider_id,
                "provider_name": str(provider.get("name") or provider_id),
                "model": model_name,
                "primary": bool(provider.get("primary")),
                "provider_order": provider_index,
                "model_order": model_index,
                "supports_multi_reference": True,
                "supports_mask": "gpt-image" in low or "qwen-image-edit" in low or "flux.2" in low,
                "max_reference_images": max_reference_images,
            })
    return catalog


def _priority_index(model: str, mode: str) -> int:
    validate_mode(mode)
    low = str(model or "").lower()
    for index, hint in enumerate(STANDARD_PRIORITIES):
        if hint in low:
            return index
    return len(STANDARD_PRIORITIES) + 1


def route_candidates(
    catalog: Iterable[dict[str, Any]],
    mode: str,
    provider_id: str = "",
    model: str = "",
) -> list[dict[str, Any]]:
    mode = validate_mode(mode)
    provider_id = str(provider_id or "").strip().lower()
    model = str(model or "").strip()
    items = [dict(item) for item in catalog or [] if isinstance(item, dict)]
    if provider_id:
        items = [item for item in items if str(item.get("provider_id") or "").lower() == provider_id]
    if model:
        exact = [item for item in items if str(item.get("model") or "") == model]
        if not exact:
            raise ValueError("所选平台没有该兼容图片编辑模型")
        exact.sort(key=lambda item: (
            0 if item.get("primary") else 1,
            int(item.get("provider_order") or 0),
            int(item.get("model_order") or 0),
        ))
        return exact
    items.sort(key=lambda item: (
        _priority_index(item.get("model", ""), mode),
        0 if item.get("primary") else 1,
        int(item.get("provider_order") or 0),
        int(item.get("model_order") or 0),
    ))
    return items


def select_route(catalog: Iterable[dict[str, Any]], mode: str, provider_id: str = "", model: str = "") -> dict[str, Any]:
    candidates = route_candidates(catalog, mode, provider_id, model)
    if not candidates:
        raise ValueError("没有找到兼容的图片编辑模型，请检查 API 设置")
    return candidates[0]


def normalize_inputs(inputs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in inputs or []:
        if not isinstance(value, dict):
            continue
        role = str(value.get("role") or "").strip().lower()
        url = str(value.get("url") or "").strip()
        if role not in ALLOWED_INPUT_ROLES or not url or role in seen:
            continue
        seen.add(role)
        normalized.append({
            "role": role,
            "url": url,
            "name": str(value.get("name") or role)[:240],
            "kind": "image",
            "mime": str(value.get("mime") or "")[:120],
        })
    return normalized


def normalize_universal_inputs(inputs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, value in enumerate(inputs or []):
        if not isinstance(value, dict):
            continue
        reference_type = str(value.get("reference_type") or value.get("role") or "").strip().lower()
        url = str(value.get("url") or "").strip()
        if reference_type not in UNIVERSAL_REFERENCE_ROLE_IDS or not url:
            continue
        raw_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(value.get("reference_id") or f"reference_{index + 1}"))[:80]
        reference_id = raw_id or f"reference_{index + 1}"
        if reference_id in seen_ids:
            reference_id = f"{reference_id}_{index + 1}"
        seen_ids.add(reference_id)
        normalized.append({
            "role": reference_type,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "url": url,
            "name": str(value.get("name") or reference_type)[:240],
            "label": re.sub(r"\s+", " ", str(value.get("label") or "").strip())[:160],
            "instruction": re.sub(r"\s+", " ", str(value.get("instruction") or "").strip())[:300],
            "kind": "image",
            "mime": str(value.get("mime") or "")[:120],
        })
        if len(normalized) >= UNIVERSAL_REFERENCE_LIMIT:
            break
    return normalized


def validate_input_roles(operation: str, inputs: Iterable[dict[str, Any]], options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    operation = validate_operation(operation)
    options = options if isinstance(options, dict) else {}
    if operation == "universal":
        values = list(inputs or [])
        if len(values) > UNIVERSAL_REFERENCE_LIMIT:
            raise ValueError(f"全能模式最多上传 {UNIVERSAL_REFERENCE_LIMIT} 张参考图")
        normalized = normalize_universal_inputs(values)
        if not any(item["reference_type"] == "subject" for item in normalized):
            raise ValueError("全能模式至少需要一张主体/模特参考图")
        return normalized
    normalized = normalize_inputs(inputs)
    roles = {item["role"] for item in normalized}
    required = set(OPERATION_INPUTS[operation])
    if operation == "pose_transfer" and str(options.get("pose_source") or "preset") == "reference":
        required.add("pose")
    if operation == "background_change" and str(options.get("background_mode") or "preset") == "reference":
        required.add("background")
    missing = sorted(required - roles)
    if missing:
        raise ValueError("缺少必需输入：" + "、".join(missing))
    return normalized


def target_size(width: int, height: int, mode: str, aspect_ratio: str = "source", resolution: str = "auto") -> str:
    mode = validate_mode(mode)
    width = max(1, int(width or 1))
    height = max(1, int(height or 1))
    aspect_ratio = str(aspect_ratio or "source").strip().lower()
    resolution = str(resolution or "auto").strip().lower()
    if aspect_ratio not in ASPECT_RATIOS:
        raise ValueError("不支持的生成比例")
    if resolution not in RESOLUTIONS:
        raise ValueError("分辨率只能是 auto、1k、2k 或 4k")
    resolved_resolution = "2k" if resolution == "auto" else resolution
    if aspect_ratio != "source":
        return SIZE_PRESETS[aspect_ratio][resolved_resolution]
    long_edge = {"1k": 1024, "2k": 2048, "4k": 3840}[resolved_resolution]
    scale = long_edge / max(width, height)
    out_w = max(64, int(round(width * scale / 64)) * 64)
    out_h = max(64, int(round(height * scale / 64)) * 64)
    return f"{out_w}x{out_h}"


def resolve_generation_settings(
    width: int,
    height: int,
    mode: str,
    aspect_ratio: str = "source",
    resolution: str = "auto",
    quality: str = "auto",
    count: int = 0,
) -> dict[str, Any]:
    mode = validate_mode(mode)
    aspect_ratio = str(aspect_ratio or "source").strip().lower()
    resolution = str(resolution or "auto").strip().lower()
    quality = str(quality or "auto").strip().lower()
    if aspect_ratio not in ASPECT_RATIOS:
        raise ValueError("不支持的生成比例")
    if resolution not in RESOLUTIONS:
        raise ValueError("分辨率只能是 auto、1k、2k 或 4k")
    if quality not in QUALITIES:
        raise ValueError("质量只能是 auto、low、medium 或 high")
    try:
        selected_count = int(count or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("生成数量必须是 1 到 4") from exc
    if selected_count < 0 or selected_count > 4:
        raise ValueError("生成数量必须是 1 到 4，或使用自动")
    resolved_resolution = "2k" if resolution == "auto" else resolution
    resolved_quality = "high" if quality == "auto" else quality
    resolved_count = 1 if selected_count == 0 else selected_count
    return {
        "parameters": {
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "quality": quality,
            "count": selected_count,
        },
        "aspect_ratio": aspect_ratio,
        "resolution": resolved_resolution,
        "size": target_size(width, height, mode, aspect_ratio, resolved_resolution),
        "quality": resolved_quality,
        "count": resolved_count,
    }


def _preset_prompt(items: list[dict[str, Any]], preset_id: str, default_id: str) -> str:
    selected = next((item for item in items if item.get("id") == preset_id), None)
    if not selected:
        selected = next((item for item in items if item.get("id") == default_id), items[0])
    return str(selected.get("prompt") or "")


def _global_preservation() -> str:
    return (
        "Change only the requested dimension. Preserve identity, silhouette, proportions, colors, materials, "
        "patterns, logos, readable product text, approved accessories, lighting, camera, and every non-target region. "
        "Do not add people, products, text, watermarks, duplicated limbs, mirrored logos, or unrelated objects."
    )


def _clean_prompt_text(*values: Any) -> str:
    return re.sub(r"\s+", " ", " ".join(str(value or "") for value in values).strip()).lower()


def _analysis_lookup(options: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    raw = (options or {}).get("reference_analysis")
    if isinstance(raw, dict):
        items = raw.items()
    elif isinstance(raw, list):
        items = ((str(item.get("reference_id") or item.get("id") or index), item) for index, item in enumerate(raw) if isinstance(item, dict))
    else:
        items = []
    normalized: dict[str, dict[str, Any]] = {}
    for key, value in items:
        if isinstance(value, dict):
            normalized[str(key)] = normalize_universal_reference_analysis(value)
    return normalized


def _reference_analysis(item: dict[str, Any], options: dict[str, Any] | None) -> dict[str, Any]:
    analysis = _analysis_lookup(options)
    return analysis.get(str(item.get("reference_id") or "")) or analysis.get(str(item.get("name") or "")) or {}


def _reference_detail(item: dict[str, Any], analysis: dict[str, Any] | None = None) -> str:
    analysis = analysis or {}
    detail = (
        analysis.get("item_name")
        or item.get("label")
        or analysis.get("category")
        or item.get("name")
        or item.get("reference_type")
        or item.get("role")
        or "reference"
    )
    visual = analysis.get("visual_details") or ""
    return re.sub(r"\s+", " ", f"{detail}; {visual}" if visual else str(detail)).strip()[:360]


def infer_universal_interaction(item: dict[str, Any], analysis: dict[str, Any] | None = None) -> str:
    analysis = analysis or {}
    role = str(item.get("reference_type") or item.get("role") or "").strip().lower()
    suggested = str(analysis.get("interaction") or "").strip().lower()
    text = _clean_prompt_text(
        role,
        item.get("label"),
        item.get("instruction"),
        item.get("name"),
        analysis.get("item_name"),
        analysis.get("category"),
        analysis.get("visual_details"),
    )
    if role == "subject":
        return "identity"
    if role in {"upper_garment", "lower_garment", "full_garment"}:
        return "wear"
    if role == "shoes":
        return "put_on"
    if role == "pose":
        return "pose"
    if role == "scene":
        return "scene"
    if role == "style":
        return "style"
    if any(keyword in text for keyword in BAG_KEYWORDS):
        return "carry"
    if any(keyword in text for keyword in PLACED_PROP_KEYWORDS):
        return "place"
    if any(keyword in text for keyword in HANDHELD_KEYWORDS):
        return "hold"
    if any(keyword in text for keyword in ACCESSORY_WEAR_KEYWORDS):
        return "wear"
    if suggested in {"wear", "put_on", "hold", "carry", "place", "use"}:
        return suggested
    return "wear" if role == "accessory" else "hold"


def _interaction_phrase(index: int, item: dict[str, Any], analysis: dict[str, Any] | None = None) -> str:
    role = str(item.get("reference_type") or item.get("role") or "").strip().lower()
    detail = _reference_detail(item, analysis)
    interaction = infer_universal_interaction(item, analysis)
    if role == "subject":
        return f"Use Image {index} as the exact same primary model, preserving identity, face, hair, body proportions, and skin tone."
    if role == "upper_garment":
        return f"Dress the model in the exact upper garment from Image {index} ({detail})."
    if role == "lower_garment":
        return f"Dress the model in the exact lower garment from Image {index} ({detail})."
    if role == "full_garment":
        return f"Dress the model in the exact full outfit or dress from Image {index} ({detail})."
    if role == "shoes":
        return f"Put the exact shoes from Image {index} ({detail}) on the model's feet."
    if role in {"accessory", "prop"}:
        if interaction == "wear":
            verb = "Have the model wear"
        elif interaction == "put_on":
            verb = "Put"
        elif interaction == "carry":
            verb = "Have the model naturally carry"
        elif interaction == "place":
            verb = "Place"
        elif interaction == "use":
            verb = "Have the model naturally use"
        else:
            verb = "Have the model naturally hold"
        placement = f" {analysis.get('placement')}." if analysis and analysis.get("placement") else ""
        return f"{verb} the exact item from Image {index} ({detail}).{placement}"
    if role == "pose":
        return f"Make the model follow only the body pose/action from Image {index}; do not copy that person's identity, clothing, accessories, or background."
    if role == "scene":
        return f"Place the model and products inside the scene from Image {index}, matching environment layout, perspective, and natural lighting."
    if role == "style":
        return f"Apply only the color, lighting, contrast, and finish style from Image {index}; do not copy its subjects or layout."
    return f"Use Image {index} as a reference for {detail}."


def build_universal_auto_instruction(inputs: Iterable[dict[str, Any]], options: dict[str, Any] | None = None) -> str:
    normalized = list(inputs or [])
    lines = []
    for index, item in enumerate(normalized, 1):
        lines.append(_interaction_phrase(index, item, _reference_analysis(item, options)))
    if not lines:
        return ""
    return (
        "AUTO FINAL COMPOSITION: "
        + " ".join(lines)
        + " Produce one coherent, high-end e-commerce product image with a polished catalog/lifestyle look, clean composition, believable fit, contact, scale, shadows, and product fidelity."
    )


def build_prompt(operation: str, inputs: Iterable[dict[str, Any]], options: dict[str, Any] | None = None) -> str:
    operation = validate_operation(operation)
    normalized = validate_input_roles(operation, inputs, options)
    options = options if isinstance(options, dict) else {}
    ordered_roles = [item["role"] for item in normalized if item["role"] != "mask"]
    role_lines = "; ".join(f"Image {index + 1} is {role}" for index, role in enumerate(ordered_roles))
    mask_note = " A final mask reference marks red pixels to replace and green pixels to preserve." if any(item["role"] == "mask" for item in normalized) else ""
    instruction = str(options.get("instruction") or "").strip()

    if operation == "universal":
        role_names = {
            "subject": "PRIMARY SUBJECT / MODEL IDENTITY",
            "upper_garment": "UPPER GARMENT",
            "lower_garment": "LOWER GARMENT",
            "full_garment": "DRESS OR FULL OUTFIT",
            "shoes": "SHOES",
            "accessory": "JEWELRY OR ACCESSORY",
            "prop": "PROP OR PRODUCT",
            "pose": "POSE ONLY",
            "scene": "SCENE / BACKGROUND ONLY",
            "style": "STYLE / LIGHTING ONLY",
        }
        reference_map = []
        for index, item in enumerate(normalized):
            analysis = _reference_analysis(item, options)
            detail = item.get("label") or item.get("name") or item["reference_type"]
            if analysis.get("item_name"):
                detail = analysis["item_name"]
            if analysis.get("visual_details"):
                detail = f"{detail}; {analysis['visual_details']}"
            note = f"; specific instruction: {item['instruction']}" if item.get("instruction") else ""
            reference_map.append(f"Image {index + 1} = [{role_names[item['reference_type']]}] {detail}{note}")
        auto_instruction = build_universal_auto_instruction(normalized, options)
        user_instruction = instruction
        final_instruction = auto_instruction
        if user_instruction:
            final_instruction = f"{auto_instruction}\nUSER SUPPLEMENT: {user_instruction}" if auto_instruction else user_instruction
        task = (
            "Create one coherent, photorealistic e-commerce image by following this exact ordered reference map:\n"
            + "\n".join(reference_map)
            + "\nFINAL COMPOSITION: " + final_instruction
            + "\nREFERENCE OWNERSHIP RULES: Subject references own identity, face, hair, skin tone, and body proportions only. "
              "Garment, shoe, accessory, and prop references own their exact product geometry, construction, material, color, pattern, logo, and readable text only. "
              "Pose references own only body posture, joint arrangement, balance, and gesture; never copy their identity, clothing, accessories, camera, or background. "
              "Scene references own only environment, layout, camera perspective, and environmental lighting; never copy foreground people or products. "
              "Style references own only palette, finish, contrast, and lighting treatment; never copy subjects or layout. "
            "CONFLICT PRIORITY: (1) subject identity, (2) exact product fidelity, (3) requested pose and contact, (4) scene composition and lighting, (5) style. "
            "Resolve occlusion, fit, scale, perspective, grip, contact shadows, reflections, fabric folds, and anatomy physically. "
            "Do not blend identities or leak clothing, people, props, or backgrounds between references."
        )
    elif operation == "try_on":
        category = {"upper": "upper-body garment", "lower": "lower-body garment", "dress": "dress or one-piece", "auto": "garment"}.get(str(options.get("garment_category") or "auto"), "garment")
        garment_type = re.sub(r"\s+", " ", str(options.get("garment_type") or "").strip())[:120]
        detected_note = f" The garment was visually identified as {garment_type}." if garment_type else ""
        task = (
            f"Put the exact {category} from the garment reference onto the person in the source image. "
            f"{detected_note} "
            "Preserve the source person's face, hair, body shape, pose, hands, framing, lighting, and background. "
            "Preserve the garment neckline, sleeve and hem geometry, fit, fabric texture, colors, pattern, logo, and text. "
            "Create physically natural folds, seams, coverage, and occlusions."
        )
    elif operation == "pose_transfer":
        if str(options.get("pose_source") or "preset") == "reference":
            target = "Use only the body posture and joint arrangement from the pose reference image. Do not copy that person's identity, clothes, or background."
        else:
            target = "Apply this target pose: " + _preset_prompt(POSE_PRESETS, str(options.get("pose_preset") or "standing_front"), "standing_front") + "."
        task = (
            target + " Preserve the source person's identity, facial expression, body proportions, outfit, accessories, product details, camera framing, lighting, and background. "
            "Keep anatomy, balance, hands, feet, folds, and occlusions realistic."
        )
    elif operation == "prop_replace":
        target_description = str(options.get("target_description") or "the matching existing prop").strip()
        task = (
            f"Replace only {target_description} in the source image with the exact prop from the prop reference. "
            "Match believable scale, perspective, grip or contact, lighting, shadow, and reflections. Preserve the new prop's shape, material, colors, logo, and text. "
            "Remove every remnant of the old prop while leaving all pixels outside the target region semantically unchanged."
        )
    elif operation == "angle_change":
        azimuth = max(-180, min(180, int(options.get("azimuth") or 0)))
        elevation = max(-30, min(30, int(options.get("elevation") or 0)))
        distance = {"close": "close shot", "medium": "medium shot", "wide": "wide full-subject shot"}.get(str(options.get("distance") or "medium"), "medium shot")
        task = (
            f"Move the camera to azimuth {azimuth} degrees and elevation {elevation} degrees, using a {distance}. "
            "Rotate the viewpoint around the subject; do not rotate, redesign, mirror, or replace the subject. "
            "Infer newly visible surfaces consistently with the same structure, materials, colors, logos, and text."
        )
    else:
        background_mode = str(options.get("background_mode") or "preset")
        if background_mode == "reference":
            target = "Use the background reference for environment, composition, palette, and lighting, without copying any foreground subject from it."
        elif background_mode == "prompt":
            target = str(options.get("background_prompt") or "clean professional e-commerce studio background").strip()
        else:
            target = _preset_prompt(BACKGROUND_PRESETS, str(options.get("background_preset") or "studio_white"), "studio_white")
        task = (
            f"Replace only the background with: {target} Preserve the foreground person or product exactly, including silhouette, hair, transparent materials, colors, logos, and text. "
            "Create natural contact shadows, reflections, depth of field, and coherent light direction without halos or clipped edges."
        )

    preservation = (
        "Preserve every reference-owned attribute unless the final composition explicitly changes it. "
        "Add only the mapped subjects and products. Do not add unrelated people, products, text, watermarks, duplicate objects, or extra limbs."
        if operation == "universal" else _global_preservation() + mask_note
    )
    parts = ([] if operation == "universal" else [role_lines + "."]) + [task, preservation]
    if instruction and operation != "universal":
        parts.append("Additional user instruction: " + instruction)
    return " ".join(part for part in parts if part).strip()


def safe_fallback_error(status_code: int, detail: str) -> bool:
    status_code = int(status_code or 0)
    if status_code == 405:
        return True
    if status_code not in {400, 404, 422}:
        return False
    text = str(detail or "").lower()
    markers = (
        "not support", "unsupported", "does not support", "model not found", "model does not exist",
        "no such model", "images api is not supported", "不支持", "未找到模型", "模型不存在",
    )
    return any(marker in text for marker in markers)


def public_capabilities(providers: Iterable[dict[str, Any]]) -> dict[str, Any]:
    catalog = build_model_catalog(providers)
    routes: dict[str, Any] = {}
    candidates = route_candidates(catalog, "standard")
    routes["standard"] = candidates[0] if candidates else None
    provider_items: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in catalog:
        if item["provider_id"] in seen:
            continue
        seen.add(item["provider_id"])
        provider_items.append({"id": item["provider_id"], "name": item["provider_name"]})
    public_models = [{key: value for key, value in item.items() if key not in {"provider_order", "model_order", "primary"}} for item in catalog]
    public_routes = {
        mode: ({key: value for key, value in route.items() if key not in {"provider_order", "model_order", "primary"}} if route else None)
        for mode, route in routes.items()
    }
    return {
        "operations": list(OPERATIONS),
        "modes": list(MODES),
        "providers": provider_items,
        "models": public_models,
        "routes": public_routes,
        "pose_presets": POSE_PRESETS,
        "background_presets": BACKGROUND_PRESETS,
        "quality_checks": QUALITY_CHECKS,
        "universal_reference_roles": UNIVERSAL_REFERENCE_ROLES,
        "universal_reference_limit": UNIVERSAL_REFERENCE_LIMIT,
        "defaults": {
            "standard": {"count": 1, "resolution": "2k", "quality": "high", "aspect_ratio": "source"},
        },
    }
