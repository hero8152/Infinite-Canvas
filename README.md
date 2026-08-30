# Infinite-Canvas · AI Agent 版

AI 无限画布：聊天驱动画图 / 图片编辑 / 视频生成 / 灵感库，支持 OpenAI 协议、ComfyUI、火山方舟、ModelScope、即梦等。

> 基于 [hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas) 二次开发，独立维护，不跟随上游（上游已于 2026-08 停更）。

## 快速开始

```bash
pip install -r requirements.txt   # macOS 可直接运行 mac-安装依赖.command，Windows 运行 安装依赖.bat
python3 main.py
# 浏览器打开 http://127.0.0.1:3000/
```

## 功能

- 多协议生图 / 生视频：OpenAI、Gemini、火山方舟、ModelScope、RunningHub、即梦 CLI、本地 ComfyUI
- 智能画布 Agent：LLM 意图路由、流式回复、360 全景预览、视频帧抽取、循环节点
- 灵感库：[awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) 541 个提示词案例 + 本地生成图，自动跟随上游更新
- tools：Chrome 批量采集素材插件、PS 直连画布插件

## 自动更新

修改 `VERSION` 为递增日期（`YYYY.MM.DD`）→ commit → push，软件内版本徽章自动检测新版本，支持一键更新与回滚。

## API 配置

在软件「API 设置」界面填写 Key / URL，勿写入代码或提交到仓库。

## 版权

禁止商业用途；二次开发须保持开源并注明来源作者。

## 链接

- 原项目（已停更）：[hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas)
- 教程视频：[YouTube](https://youtu.be/r_y_9ALr7fg)
- Chrome 采集插件：[Chrome 商店](https://chromewebstore.google.com/detail/infinite-canvas-%E5%9B%BE%E5%83%8F%E8%A7%86%E9%A2%91%E6%96%87%E5%AD%97%E6%8A%93%E5%8F%96%E5%B7%A5/ajfhnbklbmpfaaookhfakohabnpmlcic)
- 推荐 API 站（生图 / 视频 / LLM）：[apib.ai](https://apib.ai/register?aff=1uyAbb) · [fhl.mom](https://www.fhl.mom/register?aff=86L574B4T2N9)

---

<img width="2079" height="665" alt="image" src="https://github.com/user-attachments/assets/8469923b-f7a2-403c-9c37-e6e789211f28" />

<img width="1865" height="1503" alt="image" src="https://github.com/user-attachments/assets/f4030201-67c6-4845-b08b-b6fdf304afaa" />
