# Editorial Canvas Design System

**Version**: 2.0 — Mistral-faithful pass
**Reference**: <https://mistral.ai/>
**Description**: 一套贴着 Mistral 视觉语言重做的设计系统。用于 Infinite-Canvas 工作台。
关键基调：**编辑设计风的"网格纸 + 像素艺术 + 硬方角 + 日落色"**。
反例：浮夸的圆角、磨砂玻璃滥用、迪斯科色阶、Lucide/Heroicons 通用线性图标。

> 一句话风格定义：在 cream 色网格纸上做的、把所有装饰退掉、只用色块＋像素艺术＋下划线文字说话的 editorial UI。

---

## 1. 设计原则（必须遵守）

1. **方角优先**。除非另有说明，所有按钮、tab、pill、卡片**圆角 = 0**。少量内卡可用 8px，**禁止超过 12px**。彻底放弃 `rounded-full`。
2. **像素艺术是品牌核心**。所有箭头、勾选、品牌图标、loading、状态点都用 **像素方格艺术**渲染（CSS / SVG / `<canvas>` 任选），栅格固定 1px、4px、8px。**严禁**使用 Lucide / Heroicons / Feather 的圆角线性图标作为重音元素。
3. **网格纸常驻**。主 shell 背景是 `--bg`（cream）+ 浅 beige 网格底纹（默认 80px 格子，1px 线），不是装饰，是底层语义层。
4. **色块叙事**。重要内容用纯色块铺底（橙、黄、绿三色阶），靠层叠和邻接产生视觉等级，而不是阴影。**全站 `box-shadow` 默认 `none`**；只有 dark 浮卡可用 `0 1px 0 rgba(255,255,255,.04)` 这种 1px 高光，**严禁**柔光阴影。
5. **下划线即链接**。所有文字 CTA 默认带 1px 实线下划线 + 行尾像素 chevron `>`，不用蓝色、不用按钮外形。
6. **大字号一击致命**。Hero 标题字号 ≥ 96px，副标 24-28px，行距收紧（line-height 0.95-1.05）。Mistral 用"巨字 + 大量留白"，不堆装饰。

---

## 2. 排版

**单一字体家族**：`Inter`（首选）/ `Helvetica Neue` / `Arial` 几何 sans-serif。**不使用衬线字体**（旧版 DESIGN.md 里的 Playfair Display 移除）。

| Token | 用途 | 字号 | 字重 | 行距 | 字距 |
|------|------|------|------|------|------|
| `text-hero` | 首屏巨标题 | 96-128px | 500 | 0.95 | -0.02em |
| `text-display` | 章节大标 | 56-72px | 500 | 1.0 | -0.015em |
| `text-h1` | 模块标题 | 32px | 500 | 1.1 | -0.01em |
| `text-h2` | 卡片标题 | 20px | 500 | 1.2 | 0 |
| `text-body` | 正文 | 16px | 400 | 1.5 | 0 |
| `text-label` | 小标签 / nav | 14px | 500 | 1.3 | 0.01em |
| `text-mono` | 终端 / 代码块 | 13-14px | 400 | 1.45 | 0 |

- 大小写：**Sentence case** 为主，不用全大写。只有黑色段头标签（见 §6）保留 Title Case。
- 数字：用 `font-variant-numeric: tabular-nums` 保持等宽，特别是 dashboard/统计区。
- 终端 / 代码：`JetBrains Mono` / `IBM Plex Mono`，仅在像素艺术或 code 卡片里使用。

---

## 3. 色彩

### 3.1 Light（默认）

| Token | Hex | 用途 |
|------|------|------|
| `--bg` | `#fffaeb` | 全局 cream 背景（**网格底纹见 §5**） |
| `--bg-2` | `#fff4d6` | cream 加深，用于 Tonal pill 按钮 / 弱底卡 |
| `--stage-bg` | `#ffffff` | 主舞台 / iframe 卡白底 |
| `--ink` | `#0f0f0f` | 主文本 + 黑色 CTA 底色（注意不是 `#1f1f1f`，黑要够黑） |
| `--ink-2` | `#1f1f1f` | dark 模式背景 |
| `--muted` | `#6a6a6a` | 二级文本 |
| `--border` | `#e6d5a8` | beige 分隔线 / 网格线 |
| `--border-2` | `#d9c489` | 加深 beige，用于强分隔 |
| `--primary` | `#fa520f` | Mistral 橙，CTA / 像素 chevron / 重音 |
| `--primary-deep` | `#cc3a05` | hover / active 橙 |
| `--accent-amber` | `#ffa110` | sunset 中段 |
| `--accent-honey` | `#ffb83e` | sunset 偏黄 |
| `--accent-sun` | `#ffd900` | sunset 高光 |
| `--accent-pale` | `#fff8e0` | sunset 末端 |

### 3.2 Sunset Spectrum（叙事色块，参考图 2、图 4）

用于产品 stack / 服务体系层叠图。**从上到下**：

```
#cc3a05  深红橙   Portal / Vibe 顶层
#fa520f  Mistral 橙
#ff7a1f  亮橙
#ff9a2c  橙黄
#ffb83e  honey
#ffd086  浅黄
#f0dc7c  芥末
#d9d164  橄榄黄
#a8c25a  橄榄绿（服务区起点）
#6fa84a  中绿
#3f7f2a  深绿（服务区底层）
```

整张图形必须**水平/垂直对齐到 8px 栅格**，相邻色块**无圆角、无间隙**。

### 3.3 Dark（dashboard/工具卡，参考图 5、图 6、图 7）

| Token | Hex | 用途 |
|------|------|------|
| `--dark-bg` | `#0e0e10` | 卡片最深底 |
| `--dark-surface` | `#161618` | 卡片正面 |
| `--dark-elev` | `#1c1c1e` | 浮层（弹窗、嵌套卡） |
| `--dark-border` | `#2a2a2d` | 卡边 1px |
| `--dark-text` | `#f5f5f5` | 主文本 |
| `--dark-muted` | `#9a9a9a` | 二级文本 |
| `--dark-orange` | `#fa520f` | 像素 chevron / 状态点 |

dark 卡上的高光仅允许 `inset 0 1px 0 rgba(255,255,255,.04)`。**不允许**外发光或柔光投影。

---

## 4. 像素艺术图标系统（重点）

**这是 Mistral 视觉的最高识别度元素。当前实现里几乎完全缺失，必须补上。**

### 4.1 规格

- 栅格：**所有像素 icon 在 8×8 或 12×12 网格内绘制**，每像素以 `1px`、`2px`、`4px` 整数尺寸 SVG `<rect>` / CSS `box-shadow` / `image-rendering: pixelated` 的 PNG 渲染。
- **不允许斜线和抗锯齿**。所有像素必须正交对齐。
- 默认颜色：`--primary` 橙 `#fa520f`，仅在黑底白卡上可换 `#ffffff`。
- 大小档：`icon-xs` 8px、`icon-sm` 12px、`icon-md` 16px、`icon-lg` 24px、`icon-xl` 48px（"M" 品牌字像素图）。

### 4.2 必备 glyph（必须在首版交付）

| 名字 | 用途 | 形状 |
|------|------|------|
| `pixel-chevron-right` `>` | 链接 / 按钮尾箭头 | 3 列 5 行，斜阶梯，参考图 1 / 8 |
| `pixel-chevron-down` `v` | 黑色 CTA 尾标 | 横版箭头，参考图 2 / 8 / 9 |
| `pixel-check` `✓` | tonal pill 校验，参考图 9 | 2 段 4 像素折线 |
| `pixel-cross` `✕` | 关闭 / 错误 | 2 条对角像素 |
| `pixel-flame` 🔥 | "Your Model" 训练标记，参考图 4 | 3 高×3 宽 |
| `pixel-diamond` 💎 | 用户产物 | 菱形 5×5 |
| `pixel-M` | Mistral 风品牌字（项目内换成 **"IC"** 或 logo 字像素化） |
| `pixel-dot-pulse` | 在线状态 / loading | 单像素脉冲 3 帧 |
| `pixel-person` | "Human-in-the-loop" 徽章，参考图 3 | 4×6 简笔人形 |

### 4.3 实现

优先用 inline SVG（可继承 `currentColor` + `shape-rendering: crispEdges`）。示例：

```html
<svg width="12" height="8" viewBox="0 0 12 8" shape-rendering="crispEdges" fill="currentColor">
  <rect x="0" y="2" width="2" height="2"/>
  <rect x="2" y="3" width="2" height="2"/>
  <rect x="4" y="4" width="2" height="2"/>
  <!-- ...镜像下半部分 -->
</svg>
```

**禁止**用 emoji 当像素 icon，emoji 是平台 vendor 资产，颜色和渲染不可控。

---

## 5. 网格纸背景

**这是 shell 的恒久底纹，不是装饰。**

- 默认在 `body`（或 shell 容器）上铺 `background-image: linear-gradient(...)` 双向网格。
- 主格：**80px × 80px**，线宽 1px，颜色 `rgba(230, 213, 168, 0.55)`（即 `--border` 35% 透明）。
- 子格：可选 16px × 16px，线宽 1px，颜色 `rgba(230, 213, 168, 0.22)`（仅 design canvas 模式开启）。

```css
.shell {
  background-color: var(--bg);
  background-image:
    linear-gradient(to right, rgba(230,213,168,.55) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(230,213,168,.55) 1px, transparent 1px);
  background-size: 80px 80px;
}
```

**dark 模式**网格关闭或换成 `rgba(255,255,255,.03)`，整体保持纯黑，不要"夜光网格"效果。

---

## 6. 段落标签（Section Tag）

参考图 2 顶部"Technology" / "Services" 黑标签。

- **形状**：纯黑矩形，**0 圆角**，padding `8px 14px`。
- **文本**：`text-label` 白色，sentence case，左对齐。
- **像素尾**：右侧紧贴一个 `pixel-chevron-down` 橙色 12×8 icon，**像素而非 SVG line**。
- **行为**：作为整段标题悬挂在色块顶部左上角，**部分压在内容色块上 ~30%**（视觉钉子效果）。

```html
<div class="section-tag">
  <span>Technology</span>
  <svg class="pixel-chevron-down" ...></svg>
</div>
```

---

## 7. 按钮（三态）

### 7.1 Primary — 实心黑 CTA

参考图 8 右、图 9 底。

- 背景 `--ink` `#0f0f0f`，文字 `#fff`，**0 圆角**，padding `14px 22px`。
- 文末附 **像素 chevron 橙色**（`>` 或 `v`），与文字间距 12px。
- hover：背景 `#000`，chevron 像素整体右移 2px（**整数像素位移，禁止 transition 平滑**，用 `step-end`）。
- 禁用：背景 `#2a2a2a`，文字 `#888`，无 chevron。

### 7.2 Secondary — Cream Pill

参考图 8 左、图 9 三个 tonal pill。

- 背景 `--bg-2` `#fff4d6`（cream 加深），文字 `--ink`，**0 圆角**，padding `12px 20px`。
- 无边框、无阴影，靠"比底色深一档"显形。
- 行尾 **像素 chevron / pixel-check** 橙色。
- hover：背景 `#ffe9b3`（再加深一档），不动 transform。

### 7.3 Tertiary — Underlined Text Link

参考图 1 "Start building with Mistral AI"。

- 行内文字 `--ink`，**1px 实线下划线**（`text-decoration: underline; text-underline-offset: 6px;`），后缀像素 chevron 橙色。
- hover：下划线变 `--primary` 橙色，文字不变。
- **不允许**给文字链加圆角背景或 hover 高亮块。

---

## 8. 卡片三种形态

### 8.1 White Stage Card（主舞台）

iframe / 主画布容器。`#ffffff` 底 + `1px solid var(--border)` 边框，圆角 **8px 上限**，padding 24px。这是全站唯一允许小圆角的容器。

### 8.2 Cream Tonal Card（信息列表 / 价值点）

- 背景 `--bg-2`，**0 圆角**，padding `16px 20px`。
- 用于：feature list、tonal pill 群组（如参考图 9 的三条）。
- 视觉差靠底色比 `--bg` 深一档，**不画边**。

### 8.3 Dark Glass Card（工具 / agent / dashboard）

参考图 3、图 5、图 6、图 7。

- 背景 `--dark-elev` `#1c1c1e`，文字 `--dark-text`，圆角 **0-8px**（一般 0，仅嵌入头像/缩略图块可 8px）。
- 边：`1px solid var(--dark-border)` 或 0 边纯色。
- 漂浮在照片色条背景上时，可启用 `backdrop-filter: blur(8px)` + `background: rgba(28,28,30,.92)`，但 **不要加柔光投影**。
- 关键内部组件：
  - 左上角小品牌方块（24×24 像素图，橙底白像素艺术）。
  - 标题 `text-h2` 白色 sentence case。
  - 二级文本 `--dark-muted`。
  - 行内 chip：`#26262a` 底、`#f5f5f5` 字、4px 圆角（dark 模式唯一例外）、12px 字号、像素 icon 前缀。

---

## 9. 色块堆叠图（Stack Diagram）

参考图 2，是 Mistral 视觉最强的"叙事图"。

- 横排或纵排**纯色块矩阵**，全 0 圆角、0 间隙。
- 配色严格按 **§3.2 Sunset Spectrum** 从浅到深的相邻档位。
- 每块内部：左对齐 `text-h2` 黑色，右对齐二级描述 `text-body` 黑色 60% 透明。
- 黑色段落标签（§6）**悬挂在整个色块组左上角**，约 30% 压在第一块上。
- 整图放置在网格纸背景上，**整体不加边框、不加阴影**。

在我们的产品里，这套视觉可以复用为：
- 模型能力对照（文生图 / 图编辑 / 增强 / 角度 / 在线 / 聊天 / 画布）。
- 工作流分层图（前端 / API / ComfyUI 队列 / 远端模型）。

---

## 10. 照片色条背景（Photo Strip Mosaic）

参考图 3、图 4、图 5、图 7。

- 4-6 条等宽**竖向照片切片**横向排列，照片选黄昏 / 山脉 / 海面 / 沙丘等暖色调风光，**整体偏橙**。
- 上方叠 dark glass card（§8.3）做"窗口"感。
- 仅用于 hero 区或大型 callout 区，**不要在表单页和文档页使用**。

---

## 11. 主 Shell 布局

- **Sidebar**：240px 固定宽，`--bg` 同色，无边框，**网格纸延伸进来**。导航项 `text-label`，hover/active 用 `--bg-2` 实心块（**0 圆角**），不要圆角胶囊。
- **Stage**：右侧主区域，白底卡（§8.1），inset `1px solid var(--border)`。
- **Top right Nano Monitor**：保留命令栏，但去除磨砂玻璃。**改为 `--ink` 纯黑矩形 + 像素艺术状态点**。
- **Bottom Sunset Stripe**：4px 横向渐变条，颜色序列按 **§3.2 Sunset Spectrum** 的 1→6 档。Dark 模式按 1→3 档过渡到 `--ink-2`。

---

## 12. 反例（AI Slop 警戒线）

如果设计里出现以下任何一条，**视为不合格，回退重做**：

1. ❌ 大圆角按钮（`rounded-full`、`rounded-2xl`）。
2. ❌ 通用线性图标（Lucide chevron、Heroicons check）当主要装饰。
3. ❌ 渐变按钮、玻璃拟态按钮、霓虹边框。
4. ❌ 柔光 box-shadow（`0 10px 40px rgba(...)`）。
5. ❌ 紫色 / 蓝色 / 青色作为重音色（必须橙）。
6. ❌ 卡片悬停 transform translateY 弹跳。
7. ❌ 文字链做成蓝色或加底色 hover 块。
8. ❌ 用 emoji 替代像素 icon。
9. ❌ 主标题字号 < 48px（必须巨字）。
10. ❌ 装饰用衬线字体（Playfair / serif）。
11. ❌ 任何"AI 风"星星、闪光、彩虹渐变。

---

## 13. 落地清单（用于改造现有页面）

把以下项作为本次 redesign 的 Definition of Done：

- [ ] `static/index.html` shell 切换到 cream 网格纸背景，sidebar 同色无边。
- [ ] 全站统一替换 chevron / check / close / loader 为 inline SVG 像素 icon（新增 `static/icons/pixel.svg` sprite）。
- [ ] 所有按钮改成 §7 的三态，**移除全部 `rounded-full` / `rounded-2xl`**。
- [ ] 文字链统一为下划线 + 像素 chevron。
- [ ] Hero / 段落标题字号上调至 §2 表格规范。
- [ ] 在 `index.html` 首屏 / 工具切换处放一组 §6 黑色段标签 + §9 色块堆叠图，把当前功能（zimage / enhance / klein / angle / online / chat / canvas）做成 stack。
- [ ] Dashboard / 进度 / 任务面板（队列、聊天历史、画布回收站）切换到 §8.3 dark glass card。
- [ ] 移除所有柔光 `box-shadow`；底部 4px sunset 条按 §11 重做色序。
- [ ] DESIGN.md 内 §3.2 色卡渲染成实际 preview 块（可放 `static/design-tokens.html`），方便比对。

---

## 14. 在哪里看完整参考

- 官方站：<https://mistral.ai/>（hero、stack、agent card 全在首页）
- Le Chat 产品页：<https://chat.mistral.ai/>（dark glass card、tonal pill、像素 chevron 集中展示）

---

## 15. 表单组件

### 15.1 通用原则
- 所有 input / select / textarea / checkbox **0 圆角**，1px 边或 1px 底色差表达状态，**禁止 box-shadow**。
- 所有控件高度、padding 对齐 8px 栅格。
- placeholder 颜色 `--muted`，**禁止跑马灯 / 轮播提示**。
- focus 默认描 1px `--ink` 黑边（不是浏览器默认蓝 outline），橙色仅留给像素 chevron / check / 状态点。

### 15.2 Text Input / Textarea
- input 高度 40px，textarea `min-height: 96px`。
- 背景 `--stage-bg`（dark 模式 `--dark-elev`）。
- 边：默认 `1px solid var(--border)`，hover `--border-2`，focus `1px solid var(--ink)`，error `1px solid var(--primary-deep)` + 下方 12px 红橙 label 前缀 pixel-cross。
- padding `10px 14px`，字号 16px（防 iOS auto-zoom）。
- prompt 框（多行 textarea）：右下角字数计数，`text-mono` 12px `--muted`，**字数不变红，超限时变 `--primary-deep`**。

### 15.3 Select / Dropdown
- 触发器外观同 Text Input，右侧 `pixel-chevron-down` 12×8 橙色。
- 弹层：`--stage-bg` 底 + `1px solid var(--ink)` 黑边，**0 圆角**，item padding `10px 14px`。
- 选中态：item 底 `--bg-2` cream，前缀 `pixel-check` 橙色 12×12。
- hover：item 底 `--bg-2`（与选中态同色），不要 transform。

### 15.4 Slider（width / height / seed / cfg）
- 轨道：4px 高，背景 `--border`，**0 圆角**。
- 已填充段：`--ink` 黑色实块，**禁止渐变填充**。
- 滑块 handle：**14×14 像素方块**（**不是圆形**），背景 `--primary` 橙，1px `--ink` 黑边。
- 数值显示：右侧附 24×24 `--bg-2` 方块，内部 `text-mono` 12px。
- 拖动：handle **整数像素跳变**（CSS `transition: none`），不要 ease-out 平滑。

### 15.5 Number Input
- 左右各 24×24 黑色像素方块，白色 4×4 像素 `+` / `-`。
- 中间数值居中 `text-mono` 14px，**不允许浏览器原生 spinner 箭头**（`appearance: none`）。

### 15.6 Checkbox（参考图 7 connections 列表）
- 14×14 方框，`--bg-2` 底，`1px solid var(--border-2)` 边，**0 圆角**。
- 选中：`--primary` 橙底，居中白色 `pixel-check` 8×6。
- label 右侧紧贴 8px，`text-label` 14px。
- dark 模式：底 `--dark-elev`，选中态橙底白勾不变。

### 15.7 Radio
- 与 Checkbox 同形（**方形而非圆形**），选中态用 10×10 像素实心方块代替勾。
- 必要时用作图像尺寸预设、生成模式互斥项。

### 15.8 File Upload / Drop Zone
- 形状：1px 虚线 `--border-2` 边，`--bg-2` 底，**0 圆角**，min-height 160px。
- 居中：32×32 像素 upload icon 橙色 + `text-body` "Drop image or click"。
- dragover：边变 `--ink` 实线，底变 `--bg`，**不要 transform scale / 弹性反馈**。
- 已上传：64×64 缩略图（`object-fit: cover`，0 圆角）+ 文件名 + 右上角 16×16 像素 `pixel-cross` 删除浮块。

### 15.9 Tag / Chip
- 单个 chip：`--bg-2` 底，`--ink` 文字，`text-label` 14px，padding `4px 8px`，**0 圆角**。
- 内嵌 close：紧贴文本右侧 8×8 `pixel-cross` 橙色，hover `--primary-deep`。
- 用于 prompt 标签、参考图 chip、connections 已选列表。

---

## 16. 图片与媒体

### 16.1 Image Card（单张生成图）
- 图比例保持原始，外层不强制裁剪。
- 边：`1px solid var(--border)`，**0 圆角**。
- 下方 metadata 条：
  - 背景 `--bg-2`，padding `8px 12px`。
  - 上行 prompt 截断，`text-body` 16px，**单行 ellipsis**。
  - 下行 `text-mono` 12px `--muted`，格式 `1024×1024 · seed 12345 · z-image · 14:32`。
- 操作浮层：**不叠暗色蒙版**。改为在 metadata 条左侧追加 4 个 24×24 像素方块按钮（download / copy seed / delete / send to canvas），`--bg-2` 底，hover 底变 `--bg`。
- 选中态：外层边变 1px `--primary` 橙色实线，**禁止外发光 / glow**。

### 16.2 Image Grid
- 桌面默认 4 列，平板（≤1280px）2 列，手机（≤768px）1 列。
- gap **16px**（整数 8px 倍数）。
- **关闭 masonry**：保持等高同宽，避免 staggered 布局破坏网格纸的栅格感。
- 分组标题用 §6 黑色段标签悬挂在网格左上角，例如 `Today (12)` / `Yesterday (8)`。

### 16.3 加载占位（生成中 / 还没出图）
- **像素棋盘**：`--border` 与 `--bg-2` 两色交替 16×16 像素方块铺满图位，`image-rendering: pixelated`。
- 棋盘正中叠一个 §6 黑色段标签 `Rendering…`，右侧三连像素圆点橙色，**逐帧脉冲**（step-end，每 250ms 切一次）。
- **严禁** spinner 圆圈、shimmer 扫光渐变、CSS skeleton 微动。

### 16.4 生成进度（terminal 风，参考图 6）
长任务用终端面板替代进度条：
- `--dark-elev` 底，`--dark-border` 1px 边，**0 圆角**，padding `12px 16px`。
- 字体 `text-mono` 13px。
- 第一行：`> render 1024×1024 cfg=4.5 steps=20`，`>` 橙色，其余 `--dark-text`。
- 中段：水平字符进度条 `█████░░░░░ 48%`，已填段橙色，未填段 `--dark-muted`，**不要 SVG smooth 填充**。
- 末行：`elapsed 00:14 · backend 127.0.0.1:8188`，`--dark-muted`。
- 完成时整卡 step-end 切换到 §16.1 image card（不要 cross-fade）。

### 16.5 Lightbox 预览
- 全屏 `rgba(15,15,15,.92)` 背景，**不允许 backdrop-blur**（纯黑就够，blur 是 AI slop）。
- 图居中，max-zoom 100%（不放大到失真）。
- 右上角四个 32×32 像素方块按钮：close / download / copy prompt / fullscreen，透明底 + 白色像素 glyph。
- 键盘：← / → 切图，Esc 关闭，全程不允许鼠标拖拽放大缩小（避免破坏像素几何）。

### 16.6 图错误态
- 比例占位同 §16.3 棋盘，但棋盘色换成 `--primary-deep` 与 `--bg-2` 交替。
- 居中 32×32 像素 `pixel-cross` 橙色 + 下方 `text-body` `Render failed · retry`（`retry` 走 §7.3 下划线 + 像素 chevron）。

### 16.7 AI 参考图 Chip
画布 / 在线生图 / klein 编辑里挂在 prompt 框上方：
- 48×48 缩略图（`object-fit: cover`），**0 圆角**。
- 右上角 16×16 黑色像素方块叠白色 `pixel-cross`，hover 底变 `--primary-deep`。
- 多张水平排列 gap 8px，超过 6 张折行；末位追加一个 48×48 cream 加号方块（`+ N more`）。

---

## 17. 页面映射

把 §6–§16 落到每个 iframe。implementer 看本节就能直接对齐组件。

### 17.1 `index.html`（Shell）
- 整体：§5 网格纸 + §11 主 Shell。
- 左侧 sidebar：导航项按 §11 规范（cream 同色、hover `--bg-2`、**0 圆角**），**每个导航项前替换为 16×16 像素 icon**（移除现有 Heroicons 描边箭头/图层等通用图标）。
- 顶部右上 Nano Monitor：黑色矩形 + 白色 `text-mono` + 橙色像素 dot-pulse（显示在线人数 + 当前 ComfyUI 后端负载）。
- 底部 §11 Sunset Stripe 4px。

### 17.2 `zimage.html` / `enhance.html` / `klein.html` / `angle.html` / `online.html`（生成类）
统一模板：
- 左 380px 参数面板：§15 表单元素纵向堆叠（textarea 提示词 → select 模型 → slider 尺寸/cfg/steps → checkbox 转 JPG → drop zone 参考图）。
- 右侧图片网格：§16.2 grid，每张图按 §16.1 image card；正在生成的位置插 §16.3 棋盘占位 + §16.4 terminal 进度卡。
- 顶部 §6 黑色段标签 = 页面名（`Text to image` / `Detail enhance` / `Image edit` / `Angle control` / `Online generate`），sentence case。
- 主按钮：§7.1 实心黑 CTA，文末 `pixel-chevron-right` 橙，文案 `Generate`。
- 历史：直接复用 `/api/history?type=...`，挂在网格上方作为可折叠区，用 §6 段标签 `History (N)` 起头。

### 17.3 `gpt-chat.html`
- shell 仍是 cream 网格纸。
- 对话流双气泡：用户 = §8.2 Cream Tonal Card 右对齐；AI = §8.3 Dark Glass Card 左对齐。两者**全 0 圆角**。
- 输入栏：固定底部 §15.2 textarea + 右侧 §7.1 黑 CTA `Send` + 像素 chevron-right。
- 模型选择：顶部右上 §15.3 select。
- 历史会话列表：左侧 240px 列，每项 `--bg-2` 底矩形（**0 圆角**），激活态 `--ink` 黑底白字，前缀 `pixel-chevron-right`。
- 流式输出：每接到一段 delta，**整体按 24px chunk 跳显**（step-end），避免逐字 typewriter 动画与像素美学冲突。

### 17.4 `canvas.html`（无限画布）
- shell 保持 cream 网格纸：**关闭 Excalidraw 自带虚线网格**，让 §5 的 80px 主格直接作为画布底。
- 顶部工具栏：§8.3 Dark Glass Card 横条，工具按钮 32×32 像素方块，hover 底变 `--dark-bg`。
- 右侧浮动属性面板：§8.3 dark glass，floating right，宽 280px，**0 圆角**。
- 画布右下角角标：48×48 像素品牌字（"IC" 或 "∞"），`--primary` 橙色，类似图 2 的"M" 标志。
- 画布回收站 modal：§8.3 dark glass + §6 段标签 `Trash (N)` + §15.6 checkbox 多选 + §7.1/7.2 按钮组。

### 17.5 `login.html`
- §11 全屏 cream 网格纸。
- 居中 hero：`text-hero` 96-128px `Infinite-Canvas.` + 副标 24px `--muted` `The next chapter of generative AI is yours.`（致敬图 1 的 hero 句式）。
- 表单：单个 §15.2 token input + §7.1 黑 CTA `Continue`。
- 下方 §7.3 下划线文字链 `Need a token?`。
- 底部 §11 sunset stripe。

### 17.6 全站共享组件
- **Toast / Notification**：§8.3 dark glass 浮卡 + §6 段标签作为标题，3 秒 step-end 淡出（**不要 slide-in 弹性**）。
- **Dialog / Confirm**：cream 网格底 + 居中 §8.3 dark glass 卡，按钮组用 §7.1（确认 = 黑 CTA） + §7.2（取消 = cream pill）。
- **Empty state**：§16.3 像素棋盘 + 描述文字 + §7.3 下划线 CTA。
- **404 / Error page**：§5 网格纸全屏 + 居中 `text-hero` 大字 `404.` + §7.3 下划线返回链接。
