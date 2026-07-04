# 自媒体日更工作流（Media Daily Workflow）

每天在设定时间自动执行一条内容流水线，并把产物落成一张**智能画布**（与 ComfyUI 相同的节点连线方式）：

```
01 今日选题 ──input──▶ 02 发布文案 ──input──▶ 03 口播与分镜脚本
                          │                        │
                          ▼                        ▼（每个分镜一条）
                   04 封面提示词            04-N 分镜提示词
                          │                        │
                          ▼                        ▼
                   05 封面图节点            05-N 分镜配图节点
```

- 选题 / 文案 / 脚本 / 图片提示词由所配置的 LLM 生成（复用「API 设置」里的平台与 Key）。
- 画布保存在 `data/canvases/`，归属「自媒体日更」项目（可改名），打开即可微调文本、逐节点或级联一键生图。
- 可选开启「自动出图」：生成画布后由后端直接为每个提示词节点出图并写回图片节点。

## 使用入口

- 管理页：主页侧栏「自媒体日更」，或直接访问 `/static/media-workflow.html`。
- 在管理页完成：每日循环设置、模型设置、立即执行、离线试跑、自检、查看运行记录与产出画布。

## 每日循环（Loop）标准

调度器是一个后台守护线程（`media_workflow.py` 中的 `_scheduler_loop`），每 20 秒 tick 一次。触发规则：

| 规则 | 标准 |
| --- | --- |
| 触发时间 | 本地时区，每天 `daily_time`（默认 07:30）之后的第一个 tick 触发 |
| 幂等键 | 本地日期 `YYYY-MM-DD`。当天已有 `succeeded` 的 run 时不再触发；手动「立即执行」默认 `force=true` 可重跑 |
| 互斥 | 全局 `RUN_LOCK`：同一时刻只允许一个流水线在执行，定时与手动触发互斥，重复触发直接返回 busy |
| 单步重试 | 每个 LLM 步骤失败（网络错误 / JSON 解析失败）自动重试 `retry_per_step` 次（默认 2），退避 3s/6s/…；重试时附加「只输出 JSON」的纠偏提示 |
| 整体重试 | 整条流水线失败后，调度器在冷却期 300s 过后自动补试；当天自动尝试合计不超过 `max_daily_attempts`（默认 3）次 |
| 补跑 | 服务启动/唤醒时若已过当天触发时间且当天无成功 run：`catch_up=true`（默认）则立即补跑；`catch_up=false` 则只在触发时间后 15 分钟窗口内补触发 |
| 防重复选题 | 生成选题时会带上最近 30 次成功 run 的选题清单，要求避开重复 |
| 可观测 | 每个 run 及其每一步（状态 / 尝试次数 / 错误 / 警告）持久化在 `data/media_workflow_runs.json`（保留最近 200 条），管理页实时展示 |
| 降级 | 「自动出图」部分失败记为警告不阻塞 run；全部失败才记 run 失败（画布与提示词此时已生成，可手动出图） |

> 前提：整机需保持本服务运行（`run.bat` 常驻）。服务不在线的时段不会触发，恢复后按补跑规则处理。

## 自检（Self-check）方式

管理页「快速自检 / 连 LLM 检测」，或直接调接口：

```
POST /api/media-workflow/self-check
Body: {"llm_ping": false}     # true 时会真实调用一次 LLM 验证连通性
```

检查项与判定标准：

| # | 检查项 | 通过标准 |
| --- | --- | --- |
| 1 | 配置合法性 | `daily_time` 为合法 HH:MM；开启自动执行时 `topic_direction` 非空 |
| 2 | 画布目录可写 | 能在 `data/canvases/` 写入并删除探针文件 |
| 3 | LLM 平台配置 | 已选择平台且该平台在 `API/.env` 配置了 Key |
| 4 | 生图平台配置 | 同上；未开启自动出图时缺失只记警告 |
| 5 | 调度线程存活 | 调度线程 alive 且有近期心跳 |
| 6 | 运行记录读写 | `data/media_workflow_runs.json` 可读可写 |
| 7 | 画布模板结构 | 用离线示例内容组装画布：节点 id 无重复、所有连线两端节点存在、图片节点数量正确（不落盘） |
| 8 | LLM 连通性（可选） | 发送固定测试消息能拿到非空回复 |

整体结论：任一 `fail` → 整体 `fail`；无 fail 有 `warn` → `warn`；否则 `pass`。

另有**离线试跑**（`POST /api/media-workflow/run`，`{"offline": true}`）：不调用任何外部接口，用内置示例内容走完「四步内容生成 → 组装画布 → 落盘」的全链路，生成一张可打开的示例画布，用于部署后端到端验证。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/media-workflow/config` | 读取配置 |
| PUT | `/api/media-workflow/config` | 保存配置（返回下次触发时间） |
| GET | `/api/media-workflow/status` | 调度状态：是否开启、线程存活、下次触发、今天的执行情况 |
| GET | `/api/media-workflow/runs?limit=30` | 运行记录（含每步状态） |
| POST | `/api/media-workflow/run` | 手动执行：`{"force": bool, "offline": bool}`，异步启动 |
| POST | `/api/media-workflow/self-check` | 自检：`{"llm_ping": bool}` |

## 配置字段（data/media_workflow.json）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| enabled | false | 是否开启每日自动执行 |
| daily_time | "07:30" | 每天触发时间（本地时区） |
| topic_direction | "" | 账号主题方向（选题依据，开启自动执行时必填） |
| platform | "抖音" | 目标平台，影响文案风格 |
| audience / style_notes | "" | 目标人群 / 风格补充（可选） |
| llm_provider / llm_model | "" | 文案链路使用的平台与模型 |
| image_provider / image_model | "" | 生图平台与模型（写入画布设置） |
| image_ratio / image_resolution | portrait / 1k | 出图比例与分辨率（与智能画布取值一致） |
| image_style | "" | 统一图片风格，附加到每条提示词 |
| shot_count | 4 | 分镜数（1-9），决定提示词/图片节点数量 |
| auto_generate_images | false | 生成画布后是否直接后端出图 |
| catch_up | true | 错过触发时间是否补跑 |
| max_daily_attempts | 3 | 当天流水线最多自动尝试次数 |
| retry_per_step | 2 | 单个 LLM 步骤的额外重试次数 |
| project_name | "自媒体日更" | 画布归属项目（不存在自动创建） |

## 验收标准

1. `python -m py_compile main.py media_workflow.py` 通过。
2. 启动服务后：`GET /api/media-workflow/status` 返回 `scheduler_alive: true`。
3. 快速自检（不含 LLM 项）在已配置 Key 的环境全部 `pass`。
4. 离线试跑生成一张画布：管理页运行记录出现成功记录，点「打开」能在智能画布中看到按上述拓扑连线的节点图。
5. 配置真实 LLM 后「立即执行一次」：产出当天选题画布，文案/脚本/提示词节点内容非空。
6. 开启 enabled 后，到达设定时间自动产出当天画布；当天重复到点不重复执行。
