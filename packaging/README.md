# Packaging

本目录提供平台打包脚本。日常本地测试优先用顶层一键脚本，它会根据当前系统选择 Windows 或 macOS 打包链路。

```bash
python packaging/build_local.py
```

默认行为：

- Windows：生成 payload、`dist/windows-release/` 更新源、launcher/service/updater、便携 zip；如果找到 Inno Setup `ISCC.exe`，同时生成安装包。
- macOS：生成 payload、`dist/macos-release/` 更新源、`.app`、便携 zip；如果找到 `hdiutil`，同时生成 DMG。
- Windows 与 macOS 都会自动创建独立的打包 venv，并安装 `requirements.txt` 与 `PyInstaller`。
- 默认更新源为 `https://github.com/hero8152/Infinite-Canvas/releases/latest/download`。

常用参数：

```bash
python packaging/build_local.py --skip-release
python packaging/build_local.py --skip-portable
python packaging/build_local.py --skip-installer
python packaging/build_local.py --skip-dmg
python packaging/build_local.py --strict-tools
python packaging/build_local.py --update-base-url https://example.com/releases/latest/download
```
