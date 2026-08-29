# Infinite-Canvas · AI Agent 版

AI 无限画布：聊天驱动画图 / 图片编辑 / 视频生成 / 灵感库，支持 OpenAI 协议、ComfyUI、火山方舟、ModelScope、即梦等。

> 本仓库基于 [hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas) 二次开发，新增智能画布 AI Agent 面板（灵感库、意图路由、流式回复等）。上游已于 2026-08 停更，**本仓库独立维护，不再跟随上游**。

## 快速开始

```bash
# 1. 安装依赖（macOS 直接运行 mac-安装依赖.command；Windows 运行 安装依赖.bat）
pip install -r requirements.txt

# 2. 启动服务
python3 main.py

# 3. 浏览器打开 http://127.0.0.1:3000/
```

> 打包目录 `packages/` 内含离线依赖，`mac-安装依赖.sh` 会优先从本地安装，无需联网。

## 支持的功能

- 所有 OpenAI 协议 / 异步协议 / Gemini 协议 / 方舟协议的 API
- RunningHub 工作流与 AI 应用调用、火山引擎、ModelScope 免费 LLM 与图像模型
- 即梦 CLI（文生图 / 图生图 / 文生视频 / 图生视频）
- 本地局域网 ComfyUI、360 全景图预览、视频帧抽取、循环节点
- 智能画布 Agent 面板：灵感库（Civitai 搜索）、LLM 意图路由、流式回复、生成后快捷操作
- tools 目录：Chrome 批量采集素材插件、PS 直连画布插件

## 自动更新

- 更新源指向本仓库，左下角版本徽章自动检测新版本，支持一键更新与回滚
- **发版规则**：修改 `VERSION` 文件为当天日期（格式 `YYYY.MM.DD`，需递增）→ commit → push
- **可选**：设置环境变量 `GITHUB_TOKEN` 可把 GitHub API 限额从 60 次/小时提升到 5000 次/小时（公开仓库用无权限空 token 即可）

## API 配置

在软件自带「API 设置」界面填写 Key / URL，**不要**写入代码或提交到仓库（`.gitignore` 已排除敏感文件）。

## 版权

沿用原作者版权声明：禁止商业用途；基于本代码的二次开发须保持开源并注明来源作者。Commercial use is prohibited.

## 链接

- 原项目（已停更）：[hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas)
- 教程视频：[YouTube](https://youtu.be/r_y_9ALr7fg)
- Chrome 采集插件：[Chrome 商店](https://chromewebstore.google.com/detail/infinite-canvas-%E5%9B%BE%E5%83%8F%E8%A7%86%E9%A2%91%E6%96%87%E5%AD%97%E6%8A%93%E5%8F%96%E5%B7%A5/ajfhnbklbmpfaaookhfakohabnpmlcic)
- 推荐 API 站（含生图 / 视频 / LLM 模型）：[apib.ai](https://apib.ai/register?aff=1uyAbb) · [fhl.mom](https://www.fhl.mom/register?aff=86L574B4T2N9)

---

<img width="2079" height="665" alt="image" src="https://github.com/user-attachments/assets/8469923b-f7a2-403c-9c37-e6e789211f28" />

<img width="1865" height="1503" alt="image" src="https://github.com/user-attachments/assets/f4030201-67c6-4845-b08b-b6fdf304afaa" />
