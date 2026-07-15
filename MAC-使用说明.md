# ComfyUI-API-Modelscope macOS 一键启动

双击 `mac-启动服务.command` 即可启动服务。

## 终端启动

```bash
cd 项目文件夹
./mac-启动服务.sh
```

如果没有使用打包脚本，也可以直接运行：

```bash
python3 main.py
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `mac-启动服务.command` | 双击运行的启动器（自动修复权限、清理旧进程、启动服务） |
| `mac-启动服务.sh` | 终端启动脚本 |
| `mac-修复权限.command` | 单独修复 macOS 安全限制 |
| `mac-安装依赖.sh` | 安装依赖脚本 |
| `main.py` | 服务主程序 |
| `安装即梦CLI.command` | 安装/更新 dreamina CLI |
| `登录即梦CLI.command` | 登录 dreamina CLI |

## 常见问题

### 无法打开

先运行：

```bash
./mac-修复权限.command
```

### 安装依赖

优先使用项目脚本：

```bash
./mac-安装依赖.sh
```

也可以手动安装核心依赖：

```bash
pip3 install fastapi uvicorn httpx pillow requests pydantic python-dotenv websockets watchfiles
```

### 启动服务

```bash
./mac-启动服务.sh
```

或：

```bash
python3 main.py
```
