#!/bin/bash
cd "$(dirname "$0")"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$LAN_IP" ]; then
  LAN_IP="127.0.0.1"
fi
APP_URL="http://${LAN_IP}:3000/"

echo "Starting ComfyUI-API-Modelscope..."
echo "Visit: ${APP_URL}"
echo "Local: http://127.0.0.1:3000/"
echo "Press Ctrl+C to stop."
echo ""

# Open browser after 3 seconds
sleep 3 && open "${APP_URL}" &

# 本地代理地址不走系统代理，避免 Clash 等工具劫持 127.0.0.1 请求
export no_proxy="127.0.0.1,localhost,0.0.0.0"
export NO_PROXY="127.0.0.1,localhost,0.0.0.0"

python3 main.py

echo ""
echo "Server stopped."
