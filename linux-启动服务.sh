#!/bin/bash

cd "$(dirname "$0")"

if [ -x ".venv/bin/python" ]; then
    PYTHON_BIN="$PWD/.venv/bin/python"
else
    PYTHON_BIN="python3"
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [ "$PYTHON_BIN" = "python3" ]; then
    echo "[ERROR] python3 not found. Run ./linux-安装依赖.sh first."
    exit 1
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$LAN_IP" ] && command -v ip >/dev/null 2>&1; then
    LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
fi
if [ -z "$LAN_IP" ]; then
    LAN_IP="127.0.0.1"
fi

APP_URL="http://${LAN_IP}:3000/"

echo "Starting Infinite-Canvas..."
echo "Visit: ${APP_URL}"
echo "Local: http://127.0.0.1:3000/"
echo "Press Ctrl+C to stop."
echo ""

if command -v xdg-open >/dev/null 2>&1; then
    sleep 2 && xdg-open "http://127.0.0.1:3000/" >/dev/null 2>&1 &
fi

"$PYTHON_BIN" main.py

echo ""
echo "Server stopped."
