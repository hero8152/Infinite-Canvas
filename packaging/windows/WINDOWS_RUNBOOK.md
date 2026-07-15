# Windows 实机构建与联调 Runbook

这个 runbook 只解决一件事：切到 Windows 主机后，如何把当前分发层真正构建出来，并完成安装、更新、回滚、卸载联调。

## 目标产物

- `dist/windows/Infinite Canvas.exe`
- `dist/windows/Infinite Canvas Service/Infinite Canvas Service.exe`
- `dist/windows/Infinite Canvas Updater.exe`
- `dist/windows/Infinite Canvas 安装程序.exe`
- `dist/windows/Infinite-Canvas-Windows-Portable.zip`
- `dist/windows-release/`

## 环境前提

建议使用一台干净的 Windows 10/11 主机，具备以下工具：

- Python 3.11+，并能执行 `py -3`
- `pip`
- `PyInstaller`
- Inno Setup 6
- Git

建议先确认：

```powershell
py -3 --version
py -3 -m PyInstaller --version
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /?
```

## 一次完整构建

在仓库根目录执行：

### 1. 安装构建依赖

```powershell
py -3 -m pip install -r requirements.txt
py -3 -m pip install pyinstaller
```

### 2. 构建 payload

```powershell
py -3 packaging\windows\payload\build_payload.py
```

检查：

- `packaging\windows\payload\app-base.zip`
- `packaging\windows\payload\manifest.json`

### 3. 构建静态更新源

```powershell
py -3 packaging\windows\publish_release.py --update-base-url https://your-domain.example/infinite-canvas/windows
```

检查目录：

```text
dist\windows-release\
  windows-VERSION
  windows-manifest.json
  windows-app-base.zip
  <version>\
    windows-VERSION
    windows-manifest.json
    windows-app-base.zip
```

### 4. 构建 launcher / updater

```powershell
py -3 packaging\windows\build_launcher.py
```

检查：

- `dist\windows\Infinite Canvas.exe`
- `dist\windows\Infinite Canvas Service\Infinite Canvas Service.exe`
- `dist\windows\Infinite Canvas Updater.exe`

### 5. 编译安装包

```powershell
$version = (Get-Content -LiteralPath VERSION | Select-Object -First 1).Trim()
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "/DMyAppVersion=$version" packaging\windows\installer\infinite-canvas.iss
```

检查：

- `dist\windows\Infinite Canvas 安装程序.exe`

### 6. 构建便携包

```powershell
py -3 packaging\windows\build_portable.py
```

检查：

- `dist\windows\Infinite-Canvas-Windows-Portable.zip`
- zip 内包含 `Infinite Canvas Portable\Infinite Canvas.exe`
- zip 内包含 `Infinite Canvas Portable\Infinite Canvas Service\Infinite Canvas Service.exe`
- zip 内包含 `Infinite Canvas Portable\bootstrap\app-base.zip`

联调前先确认脚本引用的文件都存在：

- `dist\windows\Infinite Canvas.exe`
- `dist\windows\Infinite Canvas Service\`
- `dist\windows\Infinite Canvas Updater.exe`
- `packaging\windows\payload\app-base.zip`
- `packaging\windows\payload\manifest.json`

## 安装联调

建议至少跑两轮安装测试。

### 场景 A：默认安装

- 安装目录保持默认：`%LOCALAPPDATA%\Programs\InfiniteCanvas`
- `storage_root` 保持默认：`%LOCALAPPDATA%\InfiniteCanvas`

验证点：

- 应用能启动
- 浏览器自动打开本地页面
- `storage_root` 下生成 `data/`、`logs/`、`backups/`
- 页面可正常调用本地 API

这一轮通常会落到 `in_place` 模式。

### 场景 B：安装到只读目录

- 安装目录改成 `C:\Program Files\InfiniteCanvas`，或手工制造一个当前用户不可写目录
- `storage_root` 改成用户有写权限的位置，例如 `D:\InfiniteCanvasData`

验证点：

- 启动器能自动切到 `runtime`
- `storage_root\runtime\<version>\` 被正确展开
- `main.py`、`static\` 等从 runtime 目录运行
- 数据仍写到 `storage_root`

## 更新联调

默认更新源是 GitHub Releases latest/download；也可以准备一个可访问的静态更新源并覆盖 `update_base_url`。

### 1. 首次安装旧版本

- 安装一个旧版
- 确认 `bootstrap\manifest.json` 中的 `update_base_url` 指向 GitHub Releases 或真实静态源

### 2. 发布新版本静态目录

- 更新 `VERSION`
- 重跑：
  - `packaging\windows\payload\build_payload.py`
  - `packaging\windows\publish_release.py`

### 3. 在已安装客户端点击更新

验证点：

- `/api/launcher/check-update` 能发现新版本
- `/api/launcher/apply-update` 成功
- `storage_root\backups\launcher\` 下新增备份目录
- `runtime` 模式下，`current.txt` 指向新版本
- `in_place` 模式下，安装目录 payload 被替换

## 回滚联调

在完成一次更新后，执行页面中的回滚操作。

验证点：

- 页面能列出 launcher 备份
- 选择备份后能成功调用 `/api/launcher/rollback`
- `runtime` 模式下，`current.txt` 切回旧版本
- `in_place` 模式下，`main.py` / `VERSION` 等 payload 文件恢复
- 回滚后提示“重启打包版应用”

## 卸载联调

执行卸载时，重点验证自定义数据处理页。

### 场景 A：保留数据

- 进入卸载
- 选“保留数据”
- 完成卸载

验证点：

- 程序文件被卸掉
- `storage_root` 仍保留

### 场景 B：不保留数据

- 进入卸载
- 选“不保留数据”
- 完成卸载

验证点：

- 程序文件被卸掉
- `storage_root` 被清理

### 场景 C：不选直接下一步

验证点：

- 安装器不允许继续
- 必须二选一

## 局域网访问联调

当前打包版服务监听 `0.0.0.0:<实际端口>`。默认优先尝试 `3000`，如果被占用会自动切到其他空闲端口。Windows 实机需要额外确认两件事：

- Windows Defender Firewall 是否放行
- 同网段设备能否访问 `http://<host-ip>:<实际端口>/`

建议验证：

```powershell
ipconfig
netstat -ano | findstr LISTENING
```

然后从另一台设备访问：

```text
http://<局域网 IP>:<实际端口>/
```

如果希望安装器阶段自动加防火墙规则，这一项应单独作为下一步需求处理；本轮还没实现。

## 常见失败点

- `payload` 漏文件：
  - 当前已把 `app_runtime.py` 纳入 payload；如果后续再新增 runtime 依赖文件，必须同步更新 `build_payload.py`
- `update_base_url` 为空：
  - 默认 manifest 已配置 GitHub Releases；如果自定义 manifest 置空，launcher 会直接返回“未配置 update_base_url”
- 安装目录可写性判断与预期不符：
  - 以“当前用户是否能写临时文件”为准，不以路径名判断
- `3000` 被占用：
  - 打包版会自动避让到其他空闲端口
  - 实际端口会写入 `storage_root\data\launcher-state.json`
- Inno Setup 脚本引用路径错误：
  - 先检查 `dist\windows\` 和 `packaging\windows\payload\` 产物是否存在

## 建议的验收顺序

1. 先在默认目录完成安装与启动
2. 再验证 `Program Files` 或不可写目录下的 `runtime` 自动切换
3. 再验证静态更新源上的更新
4. 再验证 launcher 回滚
5. 最后验证卸载时的数据保留/删除分支
