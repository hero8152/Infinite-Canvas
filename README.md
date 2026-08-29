# Infinite-Canvas
Supports comfyui/API calls/modelscope calls

----

## 本分支改动说明（AI Agent 版）

> 本仓库是基于原项目 [hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas) 的二次开发 fork，新增了智能画布 AI Agent 面板。
>
> **当前版本：v2.1**（查看 [版本更新大纲](./CHANGELOG.md)）

### 重要提示
- **自动更新已开启**：更新源指向本仓库 [mufanmu/Infinite-Canvas-agent](https://github.com/mufanmu/Infinite-Canvas-agent)，左下角版本徽章会自动检测并提示新版本。上游 `hero8152/Infinite-Canvas` 已于 2026-08-28 宣布停更，本分支自此独立维护，不再跟随上游。
- **版本号规则**：`VERSION` 文件使用日期格式（`YYYY.MM.DD`），发版时改为当天日期即可，只需保证递增。
- **可选：配置 GitHub Token**：GitHub 对未认证 API 限流 60 次/小时（按出口 IP 计），自动更新列文件清单时可能触发 403。设置环境变量 `GITHUB_TOKEN` 后限额提升到 5000 次/小时，不设置则行为不变。公开仓库用无权限的空 token 即可，无需勾选任何 scope。
- **禁止商业用途**：沿用原作者版权声明（见文末），二次开发须保持开源并注明来源作者。
- **不要提交 API Key到仓库**：请在软件自带的「API 设置」界面填写 Key/URL，不要写入代码或提交到仓库（`.gitignore` 已排除敏感文件与运行时数据）。

> This fork adds an AI Agent panel to the canvas. Auto-update points to this repo (mufanmu/Infinite-Canvas-agent), not the upstream project. Do not commit API keys. Commercial use remains prohibited.

### 版本更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-07-18 | 首发：右侧加了 AI 聊天框，能边聊边在画布上画图；可建多个对话；能调图片的比例、清晰度、数量 |
| v1.1 | 2026-07-19 | AI 更懂你的话（自动分清“改风格”还是“换主体”）；刷新网页不丢正在画的图；画图有实时提醒 |
| v1.3 | 2026-07-19 | 新增“思维模式”：AI 先帮你把想法补全再画；需求说不清时自动弹选项让你选；修复发送按钮失灵 |
| v1.4 | 2026-07-19 | 多张图全部确认后再一起生成；提示词可直接在卡片上改；AI 记忆更稳 |
| v1.5 | 2026-07-19 | “数量”用输入框填、“比例/清晰度”用按钮选，分工更清楚 |
| v1.5.1 | 2026-07-19 | 修复“只要 1 张却给好几张”的问题 |
| v1.6 | 2026-07-20 | 关掉思维模式直接画图、不等 AI；思维模式会一步步追问帮你补细节；可框选多张图一起发给 AI；附件能拖动排序 |
| v2.0 | 2026-07-21 | AI 大脑升级：自动判断你想“画图/修改/分析/反推提示词”；回复逐字显示；生成后有“修改/变体/反推”快捷按钮；听不懂会主动问你（详见下方大纲） |
| **v2.1** | **2026-07-22** | **新增“灵感库”**：内置海量 AI 图片，支持中文/英文搜索（如搜“猫”“海报”）和分类标签筛选；喜欢的图一键导入画布当参考；图片自动存本地、刷新不丢；浏览更顺滑、不再上下跳动 |

### v2.1 更新大纲

本次新增“灵感库”——一个内置的 AI 图片灵感面板：

1. **海量 AI 图片**：接入 Civitai，按热门/最新/点赞/收藏随便刷
2. **真搜索**：中文/英文都能搜（比如搜“猫”“海报”），常用中文词会自动翻译成英文标签
3. **标签筛选**：分类标签换行显示，还有“更多标签”分组面板（人物/风格/场景等 6 组共58 个）
4. **一键导入**：喜欢的图一键导入画布当参考，自动存到本地（刷新不丢），不重复导入，保留作者来源
5. **浏览更顺滑**：图片按真实比例预留位置，滚动时不再上下跳动

### v2.0 改版大纲

本次为 Agent 核心架构的大版本重构，从“补丁式正则”演进为“LLM-first 意图决策”架构：

1. **意图路由重构**：废弃旧版多层正则防护，改为 LLM 统一意图决策（generate/edit/analyze/refine/composite/clarify/meta/cancel）
2. **快速路径**：纯文生图、简单修改等明确场景跳过 LLM，零延迟直接执行
3. **流式输出**：思维模式 LLM 回复逐字显示（WebSocket 推送），带停止按钮和高度限制
4. **分析/反推分离**：反推只输出 prompt；分析输出结果 + 行动引导选项（点击即可继续操作）
5. **意图澄清（clarify）**：用户意图不明时主动提问并提供可点击选项
6. **生成后快捷操作**：每张生成图下方显示「修改 / 变体 / 反推」快捷按钮
7. **新 UI 组件**：分析结果卡片、提示词建议卡片、快捷操作栏、降级提示条、流式气泡
8. **模型无关设计**：不硬编码任何模型名称，所有能力通过用户配置动态获取
9. **安全网机制**：LLM 失败时智能回退（明确生图意图→直接生图，明确分析意图→提示重试）

----

配套的chrome采集插件已经上线：https://chromewebstore.google.com/detail/infinite-canvas-%E5%9B%BE%E5%83%8F%E8%A7%86%E9%A2%91%E6%96%87%E5%AD%97%E6%8A%93%E5%8F%96%E5%B7%A5/ajfhnbklbmpfaaookhfakohabnpmlcic?authuser=0&hl=en

详细教程：[https://youtu.be/1y9ShTvgC_w](https://youtu.be/r_y_9ALr7fg)

由于最近很多API网址关停，我找到一个稳定的网址：

https://apib.ai/register?aff=1uyAbb （包含所有生图模型/视频模型/LLM模型）

https://www.fhl.mom/register?aff=86L574B4T2N9  （包含codex和GPT image 2模型）

功能请求/功能更新/视频教程/联系我，都可以在B站评论或私信：https://space.bilibili.com/78652351


----

【新增了version文件，我每次更新都会更新version的版本号，如果你下载version文件，打开项目后，导航栏的GitHub按键就会提示新版本，如果不想查看更新提示，就删除version文件】

【A version file has been added. I update the version number with each update. If you download the version file, the GitHub button in the navigation bar will indicate the new version after opening the project. If you don't want to see update notifications, delete the version file.】

----

支持的功能：
1. 支持几乎所有OpenAI协议的API/异步协议/Gemini协议/方舟协议
2. RunningHub的工作流/AI应用/收费模型调用
3. 火山引擎调用（人脸认证还在修复bug）
4. Modelscope免费LLM模型和图像模型调用
5. 即梦CLI调用，可直接调用即梦高级会员的积分，支持文生图/图生图/文生视频/图生视频
6. 支持调用本地局域网的ComfyUI
7. 扩展图片/360全景图预览截图/视频帧抽取/循环节点等诸多功能
8. tools文件夹中，增加了chrome批量采集到素材库的插件，PS直连画布调用所有功能的插件

--------

已经申请著作权，禁止商业用途

Commercial use is prohibited.


* 可以自己使用和公司使用，禁止用于任何形式的修改封装成商业产品，商用须取得授权。

* 根据代码二次开发的软件必须保持开源并注明来源作者

* This software is for personal and company use only, but is prohibited from being modified or packaged into commercial products in any way. Commercial use requires authorization.

* Software developed based on this code must remain open source and the original author must be credited.

--------


<img width="2079" height="665" alt="image" src="https://github.com/user-attachments/assets/8469923b-f7a2-403c-9c37-e6e789211f28" />

<img width="1865" height="1503" alt="image" src="https://github.com/user-attachments/assets/f4030201-67c6-4845-b08b-b6fdf304afaa" />


<img width="1696" height="1350" alt="b68e144c5b04a322bfd035da4d89aba3" src="https://github.com/user-attachments/assets/0a6090fb-a8dd-4c3d-adee-b1f9233a2d91" />

   
<img width="1525" height="1473" alt="image" src="https://github.com/user-attachments/assets/6f61fcf9-746c-425b-9e36-cfc8d252da7c" />

   <img width="1261" height="864" alt="image" src="https://github.com/user-attachments/assets/57f3e230-3134-488f-8179-d97e7d15383a" />
<img width="1530" height="858" alt="image" src="https://github.com/user-attachments/assets/9990e42d-22d5-4a10-a1e1-ad35a634edd2" />

<img width="1735" height="1400" alt="image" src="https://github.com/user-attachments/assets/d8328ff8-bbe0-4f1c-9ffa-7b56e8a1a51d" />
<img width="2258" height="969" alt="image" src="https://github.com/user-attachments/assets/4a752d99-885d-4ba9-8b86-91b495786b5c" />


<img width="1531" height="1374" alt="image" src="https://github.com/user-attachments/assets/0af79e38-0955-4740-9e65-5c9bb057f58c" />

<img width="2196" height="1040" alt="image" src="https://github.com/user-attachments/assets/6d823668-cde2-4836-8332-1858efe5f520" />
<img width="2214" height="771" alt="image" src="https://github.com/user-attachments/assets/52e10958-753f-45ba-a50e-3bbec27be436" />
