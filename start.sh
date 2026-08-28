#!/usr/bin/env bash
# Infinite-Canvas  Linux 启动脚本
# 用法：bash start.sh  或  ./start.sh（后者需 chmod +x start.sh）
cd "$(dirname "$0")"

# 优先使用 install.sh 创建的虚拟环境里的 Python；否则退回系统 python3
if [ -x ".venv/bin/python" ]; then
    PYEXE=".venv/bin/python"
else
    PYEXE="python3"
fi

# 尝试获取局域网 IP 用于提示访问地址（失败则回退 127.0.0.1）
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"

echo "Starting Infinite-Canvas (ComfyUI-API-Modelscope)..."
echo "Visit: http://${LAN_IP}:3000/"
echo "Local: http://127.0.0.1:3000/"
echo "Press Ctrl+C to stop."
echo ""

"$PYEXE" main.py

echo ""
echo "Server stopped."
