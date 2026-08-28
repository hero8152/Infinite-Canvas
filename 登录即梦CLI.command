#!/bin/bash
cd "$(dirname "$0")"

LOG_DIR="$PWD/logs"
mkdir -p "$LOG_DIR"
LOG_PATH="$LOG_DIR/jimeng-cli-login-$(date +%Y%m%d-%H%M%S).log"

{
    echo "=== 即梦CLI 登录/检查 ==="
    echo "工作目录: $PWD"
    echo ""

    DREAMINA_BIN=$(command -v dreamina)
    if [ -z "$DREAMINA_BIN" ]; then
        echo "未找到 dreamina CLI。请先运行 安装即梦CLI.command"
        echo ""
        echo "日志: $LOG_PATH"
        echo "按 Enter 键关闭..."
        read -r
        exit 1
    fi

    echo "找到 dreamina: $DREAMINA_BIN"
    echo ""
    echo "执行登录..."
    $DREAMINA_BIN login
    echo ""

    echo "检查用户额度..."
    $DREAMINA_BIN user_credit
    echo ""

    API_DIR="$PWD/API"
    mkdir -p "$API_DIR"
    ENV_PATH="$API_DIR/.env"
    if grep -q '^JIMENG_USE_WSL' "$ENV_PATH" 2>/dev/null; then
        sed -i '' '/^JIMENG_USE_WSL/d' "$ENV_PATH"
    fi
    if grep -q '^DREAMINA_BIN' "$ENV_PATH" 2>/dev/null; then
        sed -i '' '/^DREAMINA_BIN/d' "$ENV_PATH"
    fi
    echo "JIMENG_USE_WSL=0" >> "$ENV_PATH"
    echo "DREAMINA_BIN=$DREAMINA_BIN" >> "$ENV_PATH"
    echo "已更新 API/.env: JIMENG_USE_WSL=0, DREAMINA_BIN=$DREAMINA_BIN"
    echo ""
    echo "完成。"
    echo ""
    echo "日志: $LOG_PATH"
    echo "按 Enter 键关闭..."
    read -r
} 2>&1 | tee -a "$LOG_PATH"
