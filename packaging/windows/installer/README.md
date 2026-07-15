# Installer Notes

当前安装器设计：

- 默认安装目录：`%LOCALAPPDATA%\Programs\InfiniteCanvas`
- 自定义页面：允许用户选择 `storage_root`
- 卸载时显示独立自定义窗口，必须二选一：
  - `保留数据`
  - `不保留数据`

其中 `storage_root` 承载：

- `runtime/`
- `data/`
- `logs/`
- `backups/`

卸载阶段读取 `{app}\install-meta.ini` 中记录的 `storage_root`，只有用户明确选择“不保留数据”时才删除该目录。
