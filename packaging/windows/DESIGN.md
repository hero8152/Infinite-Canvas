# Windows 双模式自动切换设计

## 目标

- 尽量不改现有 `main.py`
- 安装目录可写时，直接在安装目录运行
- 安装目录不可写时，切换到 `runtime` 模式
- 数据与运行时统一由安装器配置的 `storage_root` 承载
- 卸载时强制用户选择是否保留数据

## 目录角色

### install_dir

程序安装目录，默认值：

```text
%LOCALAPPDATA%\Programs\InfiniteCanvas
```

可由安装器自定义。

### storage_root

承载所有可变内容，默认值：

```text
%LOCALAPPDATA%\InfiniteCanvas
```

建议在安装器中明确展示为“数据与运行时目录”。

### work_dir

由启动器按安装目录可写性自动判断：

- `in_place`：`work_dir = install_dir`
- `runtime`：`work_dir = storage_root\runtime\<release>`

## 数据落点

无论哪种模式，数据都应统一指向：

```text
<storage_root>\data
<storage_root>\logs
<storage_root>\backups
```

业务代码仍按现有相对路径运行，由启动器或运行时准备以下映射：

- `API`
- `assets`
- `output`
- `data`
- `history.json`
- `global_config.json`

## 启动器决策

启动器通过创建临时文件测试安装目录是否可写，而不是判断路径是否位于 `Program Files`。

伪代码：

```text
if install_dir writable:
    mode = in_place
    work_dir = install_dir
else:
    mode = runtime
    work_dir = storage_root\runtime\<release>
```

## 端口策略

仅打包版使用端口自动避让逻辑，源码版维持原来的固定 `3000` 行为。

- 优先尝试：
  - 用户配置的首选端口
  - 上次成功启动的端口
  - `3000`
- 如果都不可用：
  - 顺序扫描 `3001-3099`
- 成功选中后：
  - 通过环境变量传给 `main.py`
  - 持久化到 `storage_root\data\launcher-state.json`

因此即使用户机器上的 `3000` 已被占用，打包版仍能继续启动，只是访问地址会变成实际选中的端口。

## 更新策略

第一阶段只更新 app payload，不更新 `launcher.exe` / `updater.exe` 本体。

- `in_place`：
  - 更新安装目录中的 app payload
- `runtime`：
  - 在 `storage_root\runtime\<new_version>` 解压新 payload
  - 切换当前版本指针

### 更新源目录

启动器消费一个纯静态目录，不要求服务端逻辑：

```text
windows-release/
  windows-VERSION
  windows-manifest.json
  windows-app-base.zip
  <version>/
    windows-VERSION
    windows-manifest.json
    windows-app-base.zip
```

- 根目录：
  - `windows-VERSION` 表示当前最新版本
  - `windows-manifest.json` / `windows-app-base.zip` 指向当前最新 payload
- 版本子目录：
  - 用于归档、审计、手工回溯
  - `windows-manifest.json` 中的 `update_base_url` 可指向该子目录

### 备份与回滚

- 每次 launcher 执行更新前，都会在 `storage_root\backups\launcher\<timestamp>-<version>\` 留一份备份
- `runtime` 模式：
  - 复用已有 `runtime\<source_version>` 目录
  - 回滚时仅切回 `current.txt`
- `in_place` 模式：
  - 把当前 payload 文件打成 `payload.zip`
  - 回滚时重新覆盖安装目录中的 payload 文件

回滚入口由 launcher 暴露，Web 前端只负责列出备份并调用 launcher API。

## 卸载策略

卸载时弹出独立窗口，要求用户二选一：

- 保留数据
- 不保留数据

只有显式选择“不保留数据”时，才删除 `storage_root`。
