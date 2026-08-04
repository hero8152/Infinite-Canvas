# Windows Packaging

本目录承载 Windows 分发层，目标是尽量不改现有业务代码：

- `launcher/`：启动器与模式判定逻辑
- `installer/`：Inno Setup 安装与卸载脚本
- `payload/`：运行时资源清单与构建辅助文件
- `updater/`：更新器实现
- `service/`：真正运行 FastAPI 服务的后台可执行入口
- `build_launcher.py`：使用 `PyInstaller` 构建 `launcher.exe` / `service/` / `updater.exe`
- `build_portable.py`：生成无需安装的 Windows 便携 zip
- `publish_release.py`：生成静态更新源目录
- `WINDOWS_RUNBOOK.md`：Windows 实机构建、安装、更新、回滚、卸载联调手册

核心约束：

- 安装目录可写时，走 `in_place` 模式
- 安装目录不可写时，走 `runtime` 模式
- 用户数据、日志、备份统一落到 `storage_root`
- 打包版默认优先使用 `3000`，若端口被占用则自动避让并持久化最后一次成功端口
- 卸载时必须显式选择“保留数据”或“不保留数据”

## 已实测构建步骤

2026-05-25 在 Windows 11 `10.0.26200`、Python `3.12.9` 上完成实际打包测试。本机 `python` 可用，`py` 启动器不可用；以下命令以 `python` 记录。

1. 生成 payload：

```powershell
python packaging\windows\payload\build_payload.py
```

2. 生成静态更新源目录：

```powershell
python packaging\windows\publish_release.py --update-base-url https://github.com/hero8152/Infinite-Canvas/releases/latest/download
```

默认输出到 `dist/windows-release/`，结构如下：

```text
dist/windows-release/
  windows-VERSION
  windows-manifest.json
  windows-app-base.zip
  2026.05.24.1/
    windows-VERSION
    windows-manifest.json
    windows-app-base.zip
```

根目录给已安装客户端检查最新版，版本子目录用于归档和审计。

3. 构建启动器和更新器：

```powershell
python packaging\windows\build_launcher.py
```

4. 使用 Inno Setup 编译安装包：

- 脚本：`packaging/windows/installer/infinite-canvas.iss`
- 需要把生成的 `launcher.exe`、`updater.exe` 与 payload 文件一起纳入安装产物

```powershell
$version = (Get-Content -LiteralPath VERSION | Select-Object -First 1).Trim()
& "C:\my_program\Inno Setup 6\ISCC.exe" "/DMyAppVersion=$version" packaging\windows\installer\infinite-canvas.iss
```

本机 2026-05-25 实测 Inno Setup 安装在 `C:\my_program\Inno Setup 6`，`iscc` 不在 PATH，两个默认安装路径 `C:\Program Files (x86)\Inno Setup 6\ISCC.exe` 与 `C:\Program Files\Inno Setup 6\ISCC.exe` 均不存在。

输出示例：

```text
dist/windows/
  Infinite Canvas.exe
  Infinite Canvas Service/
  Infinite Canvas Updater.exe
  Infinite Canvas 安装程序.exe
  Infinite-Canvas-Windows-Portable.zip
```

5. 生成便携包：

```powershell
python packaging\windows\build_portable.py
```

便携包内容以 `Infinite Canvas Portable/` 为根目录，包含 launcher、service、updater 与 `bootstrap/app-base.zip`。

## 2026-05-25 实测记录

通过项：

- `python packaging\windows\payload\build_payload.py`
  - 生成 `packaging/windows/payload/app-base.zip`
  - `manifest.json` 中 `payload_entries` 与当前仓库内容一致，无 Git diff
- `python packaging\windows\publish_release.py --update-base-url https://github.com/hero8152/Infinite-Canvas/releases/latest/download`
  - 版本：`2026.05.24.1`
  - 生成 `dist/windows-release/windows-VERSION`
  - 生成 `dist/windows-release/windows-manifest.json`
  - 生成 `dist/windows-release/windows-app-base.zip`
  - 生成 `dist/windows-release/2026.05.24.1/`
- `python packaging\windows\build_launcher.py`
  - 使用构建 venv：`build/windows-packaging-venv`
  - PyInstaller：`6.20.0`
  - 生成 `dist/windows/Infinite Canvas.exe`
  - 生成 `dist/windows/Infinite Canvas Service/Infinite Canvas Service.exe`
  - 生成 `dist/windows/Infinite Canvas Updater.exe`
- `$version = (Get-Content -LiteralPath VERSION | Select-Object -First 1).Trim(); & "C:\my_program\Inno Setup 6\ISCC.exe" "/DMyAppVersion=$version" packaging\windows\installer\infinite-canvas.iss`
  - Inno Setup compiler engine：`6.7.0`
  - 重新生成 `dist/windows/Infinite Canvas 安装程序.exe`
  - 安装包大小：`36608133` bytes
  - 输出时间：`2026-05-25 11:46:25`
  - 编译警告：脚本默认 `PrivilegesRequired=admin`，但使用 `{localappdata}` 等 per-user 目录；后续安装联调需要重点验证管理员安装模式下的目录归属是否符合预期
- 隔离 smoke test
  - 从 `packaging/windows/payload/app-base.zip` 解压临时 runtime
  - 使用 `dist/windows/Infinite Canvas Service/Infinite Canvas Service.exe` 启动服务
  - 设置 `INFINITE_CANVAS_DATA_ROOT=build/windows-packaging-smoke/service-data`
  - 设置 `INFINITE_CANVAS_PORT=3101`
  - 请求 `http://127.0.0.1:3101/api/app-info` 成功
  - 返回版本 `2026.05.24.1`，`managed_by_launcher=true`，`preferred_local_url=http://127.0.0.1:3101/`
- launcher CLI smoke test
  - `--check-update` 可运行并读取 bootstrap manifest；默认更新源为 GitHub Releases latest/download
  - `--list-backups` 可运行并返回空备份列表

仍未验证项：

- 未执行安装器 GUI 安装、卸载时保留/删除数据、桌面快捷方式、开始菜单项验证
- 未执行 GitHub Releases 真实更新/回滚联调

## 当前状态

已完成：

- 双模式判定逻辑
- `storage_root` 目录设计
- payload 构建器
- 静态更新源目录构建器
- 安装器自定义 `storage_root` 页面
- 卸载时强制二选一的数据保留窗口
- 主程序最小兼容层：支持 `INFINITE_CANVAS_DATA_ROOT`
- launcher 版更新与回滚 API
- launcher 更新前自动备份，支持 `in_place` / `runtime` 两种模式回滚
- Windows 主机上实际构建 `Infinite Canvas.exe` / `Infinite Canvas Service.exe` / `Infinite Canvas Updater.exe`
- Inno Setup 6 实机重新编译 `Infinite Canvas 安装程序.exe`
- 打包 service exe 基于 payload runtime 的 `/api/app-info` smoke test

待完成：

- 用新编译安装包实机验证安装/卸载流程
- `launcher.exe` / `updater.exe` 自身更新策略
- 启动器的 Windows UI 细节与日志展示
