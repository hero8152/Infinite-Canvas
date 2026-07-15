# macOS Packaging

本目录承载 macOS 打包层，目标是生成 `.app` 和 `.dmg`，并复用打包版的端口自动避让、runtime、更新与回滚逻辑。

核心约束：

- `.app` 本身只放 launcher、service、updater 与 bootstrap payload
- 业务代码始终解压到 `~/Library/Application Support/InfiniteCanvas/runtime/<version>`
- 用户数据、日志、备份统一落到 `~/Library/Application Support/InfiniteCanvas`
- 默认优先使用 `3000`，如果端口被占用则自动避让并持久化最后一次成功端口
- 更新只替换 app payload，不更新 `.app` 里的 launcher / service / updater 本体

## 目录说明

- `launcher/`：macOS app 启动器与 runtime 管理
- `service/`：真正运行 FastAPI 服务的后台可执行入口
- `updater/`：更新器入口
- `payload/`：macOS payload manifest 与构建脚本
- `build_app.py`：构建 `Infinite Canvas.app`
- `build_dmg.py`：构建 DMG
- `build_portable.py`：生成包含 `.app` 的便携 zip
- `publish_release.py`：生成静态更新源目录
- `MACOS_RUNBOOK.md`：macOS 实机构建、安装、更新、回滚联调手册

## 构建步骤

1. 生成 payload：

```bash
python3 packaging/macos/payload/build_payload.py
```

2. 生成静态更新源目录：

```bash
python3 packaging/macos/publish_release.py --update-base-url https://github.com/hero8152/Infinite-Canvas/releases/latest/download
```

默认输出到 `dist/macos-release/`。

3. 构建 `.app`：

```bash
python3 packaging/macos/build_app.py
```

脚本会自动创建 `build/macos-packaging-venv`，并在其中安装 `requirements.txt` 与 `PyInstaller`，避免依赖当前全局 Python 环境。
构建产物使用 PyInstaller `--onedir`，安装到 `Contents/MacOS/*.appdir/`，并保留 `Contents/MacOS/Infinite Canvas` 等同名 wrapper 作为 `.app` 入口；这样可以避免 `--onefile` 每次启动自解压导致的额外等待。

4. 构建 `.dmg`：

```bash
python3 packaging/macos/build_dmg.py
```

5. 构建便携 zip：

```bash
python3 packaging/macos/build_portable.py
```

输出示例：

```text
dist/macos/
  Infinite Canvas.app
  Infinite Canvas-2026.05.24.1.dmg
  Infinite-Canvas-macOS-Portable.zip
```

## 当前状态

已完成：

- macOS runtime 目录设计
- `.app` 骨架构建脚本
- DMG 构建脚本
- macOS payload 构建器
- 静态更新源目录构建器
- 端口自动避让
- launcher 版更新与回滚 API 对齐

待完成：

- macOS 实机 PyInstaller 构建验证
- 签名与 notarization
- launcher / service / updater 自身更新策略
