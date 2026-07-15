# macOS 打包设计

## 目标

- 打包成 `.app` 和 `.dmg`
- 不要求用户安装 Docker
- 不改源码版 mac 启动脚本
- 复用打包版 `INFINITE_CANVAS_*` 环境变量
- 避免写入 `.app`，降低签名和权限风险

## 目录角色

### app bundle

安装后的应用目录：

```text
/Applications/Infinite Canvas.app
```

包内结构：

```text
Infinite Canvas.app/
  Contents/
    Info.plist
    MacOS/
      Infinite Canvas
      Infinite Canvas Service
      Infinite Canvas Updater
    Resources/
      bootstrap/
        manifest.json
        app-base.zip
```

### storage_root

默认值：

```text
~/Library/Application Support/InfiniteCanvas
```

承载：

```text
data/
logs/
backups/
runtime/
current.txt
```

### runtime

macOS 打包版始终使用 runtime 模式：

```text
~/Library/Application Support/InfiniteCanvas/runtime/<version>
```

`.app` 只负责启动与携带 bootstrap payload，不在运行时写入业务代码或用户数据。

## 启动时序

```text
用户打开 Infinite Canvas.app
  -> Infinite Canvas launcher
  -> 读取 bootstrap/manifest.json
  -> 准备 storage_root
  -> 解压 bootstrap/app-base.zip 到 runtime/<version>
  -> 选择可用端口
  -> 启动 Infinite Canvas Service
  -> service 在 runtime/<version> 运行 main.py
  -> 浏览器打开 http://127.0.0.1:<port>/
```

## 端口策略

仅打包版使用端口自动避让逻辑。

- 优先尝试：
  - 用户配置的首选端口
  - 上次成功启动的端口
  - `3000`
- 如果都不可用：
  - 顺序扫描 `3001-3099`
- 成功选中后：
  - 通过环境变量传给 `main.py`
  - 持久化到 `storage_root/data/launcher-state.json`

## 更新策略

第一阶段只更新 app payload，不更新 `.app` 里的 launcher / service / updater。

```text
launcher 检查静态更新源 macos-VERSION
  -> 下载 macos-app-base.zip
  -> 创建 launcher 备份 metadata
  -> updater 解压到 runtime/<new_version>
  -> 写 current.txt
```

## 回滚策略

macOS 始终 runtime 模式，回滚只切换 `current.txt`：

```text
storage_root/backups/launcher/<backup-id>/metadata.json
  -> source_version
  -> current.txt = source_version
```

不需要覆盖 `.app`。

## 与 Windows 的差异

- Windows 支持 `in_place` 和 `runtime` 双模式
- macOS 始终使用 `runtime`
- Windows 可选择 `storage_root`
- macOS 默认使用 `~/Library/Application Support/InfiniteCanvas`
- macOS 更新不会写 `.app`，更利于签名和 notarization
