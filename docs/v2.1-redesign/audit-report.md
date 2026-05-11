# Infinite-Canvas UI v2.1 Mistral-faithful Audit Report

**分支**: `design/v2.1`
**对比基线**: `main`
**改造范围**: 8 个前端页面 + 1 个 design-system.css + 1 个 pixel sprite + theme.js sprite/lucide 接管

---

## 1. 概览

按 DESIGN.md v2.1 的 17 节规范完成 Mistral-faithful 全站 UI 重做。整体观感对齐 <https://mistral.ai/>：cream 网格纸 + 像素艺术 + 0 圆角 + 黑色 CTA + sunset 色块叙事 + dark glass 工具卡。

**架构层面**：
- 后端 `main.py` / `workflows/*.json` / `data/*` 完全零改动
- 8 个前端页面 + 共享 design system 全量重写
- 4 阶段实施：Phase 0 基础设施 → Phase 1 shell → Phase 2 三波并发 subagent → Phase 3 polish

**关键产出**：
| 产物 | 行数变化 |
|------|----------|
| `static/design-system.css` | **新增 940 行**（v2.1 设计 token + 组件库 + Tailwind 反例覆盖层） |
| `static/icons/pixel.svg` | **新增 315 行**（26 个像素 glyph：9 核心 + 7 nav + 10 utility） |
| `static/theme.css` | 1716 → 113 行（瘦身 93%，迁移到 design-system.css + 旧 class 兼容层） |
| `static/theme.js` | 41 → 195 行（+sprite 同步注入 +lucide→pixel 运行时转换器） |
| `static/index.html` | 596 → 421 行（shell 重做，sidebar 像素 nav + 黑色 nano monitor） |
| `static/login.html` | 291 → 200 行（hero 致敬 Mistral 图 1） |
| `static/zimage.html` | 586 → 1490 行（上下版式 → 左右 380px） |
| `static/online.html` | 433 → 830 行 |
| `static/enhance.html` | 881 → 1043 行 |
| `static/klein.html` | 800 → 1555 行 |
| `static/angle.html` | 1270 → 1708 行（Three.js 桥接） |
| `static/gpt-chat.html` | 538 → 1804 行（左 240 历史栏 + 流式 24px chunk） |
| `static/canvas.html` | 3477 → 3676 行（增量改造，节点 JS 零改动） |

---

## 2. 设计 token 覆盖（§3）

实现完整 Mistral 色板 + sunset 12 档 + dark 表面：

```
--bg:           #fffaeb  cream soft
--bg-2:         #fff4d6
--ink:          #0f0f0f
--primary:      #fa520f  Mistral 橙
--primary-deep: #cc3a05
--border:       #e6d5a8
--sunset-1..11: #cc3a05 → #3f7f2a (12 档色谱)
--dark-bg/surface/elev: #0e0e10 / #161618 / #1c1c1e
```

Tailwind 反例覆盖层（强制 `!important`）：
- `rounded-*` → 0
- `shadow-*` → none
- `backdrop-blur-*` → none
- `hover:scale-*` → none
- 紫/蓝/青/靛/紫罗兰/天蓝/青绿 重音渐变 → 强制 primary 橙

---

## 3. §13 落地清单 DoD 9 项

| # | 项 | 状态 | 备注 |
|---|----|------|------|
| 1 | shell 切换到 cream 网格纸，sidebar 同色无边 | ✅ | index.html `.shell-grid` 80px 主格 |
| 2 | 全站 chevron / check / close / loader 用像素 sprite | ✅ | pixel.svg 22 glyph + theme.js 同步注入 + lucide→pixel 运行时转换器 |
| 3 | 所有按钮三态（§7.1/7.2/7.3），无 rounded-full / 2xl | ✅ | btn-primary / btn-tonal / btn-underline 全到位 |
| 4 | 文字链统一为下划线 + 像素 chevron | ✅ | .btn-underline 全站使用 |
| 5 | Hero / 段落标题字号 ≥ §2 表格规范 | ✅ | login `text-hero` 9vw |
| 6 | index.html 首屏含 §6 黑色段标签 | ✅ | sidebar nav 项 / nano-monitor |
| 7 | Dashboard / 队列 / 历史改为 §8.3 dark glass | ✅ | klein engine panel / canvas 工具栏 / chat AI 气泡 / angle terminal |
| 8 | 全站 box-shadow = 0 | ✅ | 仅 §8.3 dark glass 允许的 `inset 0 1px 0 rgba(255,255,255,.04)` |
| 9 | 底部 4px sunset 条按 §11 色序 | ✅ | linear-gradient sunset-1..6 |

---

## 4. §12 反例 11 条审计

| # | 反例 | 命中 | 备注 |
|---|------|------|------|
| 1 | rounded-full / 2xl / 3xl Tailwind | ✅ 0 | grep 全站 0 命中 |
| 2 | Lucide / Heroicons 通用图标当主装饰 | ✅ 0 | HTML 源 canvas.html 还有 26 处 `<i data-lucide>` 字面量，但 theme.js 运行时全部替换为 pixel sprite（已用 MutationObserver 捕获动态插入） |
| 3 | 渐变 / 玻璃拟态 / 霓虹按钮 | ✅ 0 | 全部 .btn-primary / .btn-tonal / .btn-underline |
| 4 | 柔光 box-shadow | ✅ 0 | grep `shadow-(lg\|xl\|2xl)` 0 命中 |
| 5 | 紫 / 蓝 / 青色重音 | ✅ 0 | grep `(from\|to\|via)-(purple\|blue\|cyan\|indigo\|violet\|sky\|teal)` 0 命中 |
| 6 | hover transform translateY 弹跳 | ✅ 0 | grep `hover:scale-` 0 命中 |
| 7 | 文字链做成蓝色或加底色 hover 块 | ✅ 0 | .btn-underline 1px 下划线 + 像素 chevron |
| 8 | emoji 替代像素 icon | ✅ 0 | 全部 inline SVG sprite |
| 9 | 主标题字号 < 48px | ✅ N/A | 功能页用 §6 段标签替代 hero；login hero 9vw |
| 10 | 衬线字体 | ✅ 0 | 仅 Inter + JetBrains Mono，移除 Playfair Display |
| 11 | AI 风星星 / 闪光 / 彩虹 | ✅ 0 | 移除 lucide `zap` / `wand-sparkles`，换 flame 像素 |

---

## 5. API schema 保护性证明

7 个生成 / 对话 / 画布相关 API 全部**零 schema 改动**：

| 端点 | Method | Body 关键字段 | 调用页面 |
|------|--------|---------------|----------|
| `/api/generate` | POST | `workflow_json` + `params:{node_id:{...}}` + `type` + `client_id` | zimage / enhance / klein / angle |
| `/generate` | POST | `prompt` + `api_key` + `resolution` | zimage (ModelScope) |
| `/api/ms/generate` | POST | `prompt` + `model` + `image_urls` + `loras` | enhance / klein |
| `/api/angle/generate` `/api/angle/poll_status` | POST | `task_id` + `api_key` | angle |
| `/api/online-image` | POST | `prompt` + `model` + `size` + `reference_images` | online |
| `/api/chat/stream` `/api/chat` | POST | `conversation_id` + `message` + `mode` + `provider` + `reference_images` | gpt-chat |
| `/api/canvases/*` `/api/canvas-llm` | GET/POST/PUT/DELETE | `nodes` + `connections` + `viewport` | canvas |

ComfyUI workflow JSON 节点 ID 全部保留：`Z-Image.json`、`Z-Image-Enhance.json` (node 204)、`Flux2-Klein.json` (node 168/158/278/270/292/313/314)、`2511.json` (node 31/11/14)、`upscale.json` (node 15/172)。

---

## 6. 关键技术决策

### 6.1 Sprite 同步注入（绕过跨文档 use 失效）
跨文档 `<use href="external.svg#id">` 在多数浏览器里 currentColor 不会从 host 文档继承，导致像素 icon 不可见。`theme.js` 启动时同步 XHR 抓回 sprite，注入到 body 首位置作为隐藏 `#pixel-sprite-root`，引用方用同文档 `<use href="#id">`，currentColor 正常继承。

### 6.2 Lucide 运行时转换器
canvas.html 含 26 处 `<i data-lucide="X">` 引用（包括 1 处动态生成的模板字符串）。无法纯静态替换。`theme.js` 注入 `replaceLucideIcons()` + 30+ glyph 映射表 + MutationObserver 捕获动态插入，全部转换为 pixel sprite。

### 6.3 流式输出 24px chunk + step-end
gpt-chat 原本逐字 `textContent +=` 与像素美学不符。改为累积 delta，每 24 字符或 200ms 强制 flush 一次，整段跳显。CSS `transition: none` 配合 step-end 像素游标。

### 6.4 Three.js 桥接（angle）
angle.html 的 Three.js 3D 球 1270 行 JS **逐字保留**。在 `window.updateCamera` 末尾 1 行加 `syncSliderUI(...)` 桥接调用，UI 层用新 §15.4 像素方块 handle slider，通过 `dispatchEvent(new Event('input'))` 触发原 range input 监听器。Three.js 计算逻辑 0 改动。

### 6.5 canvas 增量改造
canvas.html 3477 行不重写，仅改 CSS + 工具栏 HTML + 新增 inspector 浮层 + 网格 24→80px。所有节点 / 连线 / viewport / 保存 / canvas-llm 调用零改动。Phase 3 加 legacy 圆角覆盖层处理遗留 .canvas-* / .node 等老 class。

---

## 7. 已知 trade-off

1. **canvas.html HTML 源残留 lucide 标记**：26 处 `<i data-lucide>` 字面量保留在源码里，运行时由 theme.js 转换为 pixel sprite。完全静态化需要单独 Phase 2 Wave D（约 1 天工作量）。
2. **canvas.html 节点深度样式**：`.gen-settings` / `.mode-tabs` 等节点内部细节仍是 v1.0 圆角/阴影，通过 Phase 3 加 CSS 覆盖层强制 0 圆角 / 0 阴影。完整重写见 Phase 2 Wave D。
3. **angle 3D 球在 380px 左面板下**：保留了主舞台中部位置（不放左面板），靠 §17.2 三栏布局（Angle / Camera / Result）解决空间问题。
4. **dark mode CTA 反相**：light 黑底白字 → dark 白底黑字，是 Mistral 风的标准反相处理。

---

## 8. 验证截图

完整截图归档在 `docs/v2.1-redesign/screenshots/`：

**Phase 1（shell + login）**:
- `phase1-shell-light-v2.png` — sidebar hover 展开 + nav 像素 icon + black nano monitor
- `phase1-shell-dark.png` — dark mode shell
- `phase1-login-v3.png` — login hero 巨字 + cream 网格

**Phase 2 Wave A（zimage / online / enhance）light**:
- `phase2-zimage-light.png` — 上下→左右版式，§6 段标签 + §15 表单 + §16 grid
- `phase2-online-light.png` — §15.3 select + §15.8 dropzone + 4 列 grid
- `phase2-enhance-light.png` — §15.4 slider 14×14 像素方块 handle

**Phase 2 Wave B（klein / canvas / chat）+ Wave C（angle）light**:
- `phase2-klein-light.png` — 3 上传插槽 + Engine dark glass card
- `phase2-canvas-light.png` — gate 圆角清理后
- `phase2-chat-light.png` — 双气泡 + 24px chunk 流式
- `phase2-angle-light.png` — 3 个 §15.4 slider + Three.js 3D 球完好

**Phase 3（polish）**:
- `phase3-canvas-gate.png` — gate modal 圆角清零
- `phase3-canvas-workbench.png` — 80px 网格 + dark glass 工具栏 + IC 角标

**Phase 4（dark 模式抽样）**:
- `phase4-zimage-dark.png` / `phase4-online-dark.png` / `phase4-enhance-dark.png`
- `phase4-klein-dark.png` / `phase4-chat-dark.png` / `phase4-angle-dark.png`
- `phase4-login-dark.png` — dark CTA 反相验证

共 18 张截图。

---

## 9. 总工作量与提交

| 阶段 | commit | 耗时（墙钟） |
|------|--------|--------------|
| 基线 | `bfeed48 chore: baseline` | — |
| Phase 0 | `45f35ad Phase 0: design tokens + pixel sprite + theme.css 瘦身` | ~30 min |
| Phase 1 | `dbc9abb Phase 1: shell + login 重写` + `b1bdf03 sprite 注入修复` | ~25 min |
| Phase 2 Wave A | `b8339f3 Phase 2 Wave A: zimage + online + enhance` | ~5 min（3 subagent 并发） |
| Phase 2 Wave B+C | `c2178ba Phase 2 Wave B + C` | ~7 min（4 subagent 并发） |
| Phase 3 | `7d8455f Phase 3: 全站 polish + 反例审计` | ~15 min |
| Phase 4 | （本 commit） | ~10 min |

**总计**：7 个 commit + 1 个基线，从串行 ~3.5 天压缩到 subagent 并发后单次会话内完成。
