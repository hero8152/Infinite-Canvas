# 大雄画布资产库 · Photoshop 插件

一个 Adobe Photoshop UXP 面板插件，通过局域网地址连接 Infinite Canvas 后端，双向打通 PS 与「资产库」：

- **资产 → PS**：浏览资产库，把图片素材置入当前文档
- **PS → 资产库**：把当前文档导出成 PNG，存进选中的图片分组
- **实时同步**：连上后端的 WebSocket，资产库有变化时面板自动刷新

类似 SDPPP：输入电脑的局域网 `IP:端口` 即可通讯，不需要额外配置。

## 用法

1. 启动 Infinite Canvas 后端（`启动服务.bat` / `python main.py`）。
2. 在 Photoshop 里打开「大雄资产库」面板。
3. 顶部填入服务地址：
   - 本机：`127.0.0.1:3000`（按你的实际端口），并填写 Canvas 配对访问令牌
   - 局域网：跑后端那台电脑的 `IP:端口`，例如 `192.168.1.10:3000`
4. 点「连接」。绿点表示已连接。
5. 用「资产库 / 分组」下拉切换，点素材选中：
   - **置入当前文档**：把选中图片置入 PS（双击素材也可）
   - **打开**：在外部浏览器打开原图 / 视频
6. 底部「把当前文档存到此分组 ↑」：把当前 PS 文档合并导出为 PNG，存入选中的图片分组。

> 地址会被记住，下次打开点「连接」即可恢复。右上「实时」勾选后，画布/网页那边新增素材，面板会自动刷新。

## 调试安装

1. 安装 Adobe UXP Developer Tool（UDT）。
2. 打开 Photoshop（24.0 以上）。
3. UDT → `Add Plugin` → 选择本目录的 `manifest.json`：

   ```text
   tools/photoshop-asset-connector/manifest.json
   ```

4. 点 `Load`，在 PS 的「增效工具」菜单里打开「大雄资产库」。

## 后端接口契约

| 用途 | 方法 / 路径 | 说明 |
| --- | --- | --- |
| 读取资产库 | `GET /api/asset-library` | 返回 `{ library: { libraries, active_library_id } }` |
| 上传字节 | `POST /api/ai/upload`（multipart）| 返回 `{ files:[{ url:"/assets/input/…", kind, name }] }` |
| 存入分组 | `POST /api/asset-library/items` | 体 `{ library_id, category_id, url, name }`，仅图片类分组 |
| 实时刷新 | `WS /ws/stats` | 收到 `{ type:"asset_library_updated" }` 触发刷新 |

## 说明

- `manifest.json` 用 `"network": { "domains": "all" }` 放开网络权限，所以**任意局域网地址**都能填。
- 后端 CORS 为 `*`，且 `/assets` 已作为静态目录挂载，跨机访问可直接加载缩略图。
- 视频/非图片素材可浏览、可外部打开，但不直接置入 PS。
- 导出用 `copy:true` 存合并拷贝，**不会改动你的原文档**。
- 工作流（`workflow` 类）分组不参与置入与导出。

## 代码结构（v0.3 起模块化）

多 `<script>` + 全局 `DX` 命名空间（规避 UXP 的 CommonJS 路径解析问题）：

```
index.html        外壳：顶部 Tab（资产/生成/设置）+ 三个视图
style.css         深色主题；纯 flexbox；@media 做两栏渐进增强
js/state.js       共享状态 + localStorage 键
js/net.js         地址解析 / HTTP / WS base / 字节上传
js/sources.js     三数据源适配器（assets / canvas / local）
js/ps.js          Photoshop 操作（置入 / 导出 PNG / 外部打开）
js/socket.js      WebSocket 实时同步（心跳 + 退避重连）
js/app.js         启动 + Tab 路由 + 资产视图渲染 + 事件
```

脚本按依赖顺序加载：state → net → sources → ps → socket → app。

## 路线图

- ✅ 连接 / 三源浏览 / 置入 / 导出 / 深色 / 稳定性 / Tab 地基
- ⏳ 编辑：改名 / 删除 / 移动 / 新建分组（资产库 + 本地；画布资产删改需读画布→改节点→存画布）
- ⏳ 生成 Tab：API / ModelScope / RunningHub 切换 → 模型 / 参数 → 提交 → 队列轮询 → 结果置入 PS 或存库
- ⏳ 工作流：RunningHub 工作流参数表单与调用

## 版本

- 0.3：模块化重构、顶部 Tab、两栏预览、连接稳定性加固（含服务端关闭 WS 协议 ping）。
- 0.2：切到 `/api/asset-library`，新增三数据源、PS→库导出、WebSocket 实时刷新。
- 0.1：只读浏览本地上传并置入。
