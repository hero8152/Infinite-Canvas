# 即梦 CLI 兼容补丁工具

本工具用于在 Infinite-Canvas 覆盖更新后，一键恢复即梦 CLI 的比例、分辨率和模型兼容修复。

## 包含文件

1. `patch_jimeng_cli.py`：补丁脚本，会自动寻找并修复 `main.py`、`static/js/api-settings.js`、`static/js/smart-canvas.js`。
2. `一键配置即梦CLI.bat`：Windows 双击入口。
3. `即梦CLI配置与操作指南.md`：本说明。

## 修复内容

- 修复即梦图生图不传 `--ratio` 的问题，避免画布选择 `1:1` 后即梦网页端实际变成 `16:9`。
- 支持 `1:1`、`21:9`、`16:9`、`3:2`、`4:3`、`3:4`、`2:3`、`9:16` 等官方图片比例。
- 按版本从新到旧重建官方图片模型列表：`5.0`、`4.7`、`4.6`、`4.5`、`4.1`、`4.0`、`3.1`、`3.0`。
- 按版本从新到旧重建官方视频模型列表：`seedance2.0_vip`、`seedance2.0fast_vip`、`seedance2.0mini`、`seedance2.0`、`seedance2.0fast`、`seedance1.5pro`、`seedance1.0`、`seedance1.0fast`。
- 按官方规则动态显示视频分辨率：`seedance2.0_vip` 显示 `720p/1080p/4k`，其他即梦模型只显示 `720p`，多帧视频只显示自动。
- 避免给 `multiframe2video` 传官方不支持的 `model_version` / `video_resolution`。

## 使用方式

1. 将本目录放在 `Infinite-Canvas` 根目录，或直接保留在优化工具目录中运行。
2. 双击 `一键配置即梦CLI.bat`。
3. 看到 `[SUCCESS] Patch applied successfully!` 后，重启画布后端服务。

## 说明

脚本会先为被修改文件生成 `.bak` 备份，再应用补丁，并对 `main.py` 执行 Python 语法检查。重复运行是安全的，已修复的项目会自动跳过对应补丁。
