#!/bin/bash
cd "$(dirname "$0")"

LOG_DIR="$PWD/logs"
mkdir -p "$LOG_DIR"
LOG_PATH="$LOG_DIR/jimeng-cli-install-$(date +%Y%m%d-%H%M%S).log"

{
    echo "=== 即梦CLI 安装/更新 ==="
    echo "工作目录: $PWD"
    echo ""

    if ! command -v curl >/dev/null 2>&1; then
        echo "错误: 未找到 curl。请先安装 curl。"
        echo ""
        echo "日志: $LOG_PATH"
        echo "按 Enter 键关闭..."
        read -r
        exit 1
    fi

    echo "正在安装/更新 dreamina CLI..."
    curl -fsSL https://jimeng.jianying.com/cli | bash
    echo ""

    # 确保 ~/.local/bin 在 PATH 中
    export PATH="$HOME/.local/bin:$PATH"
    # 重新加载 profile
    . ~/.profile 2>/dev/null || true
    . ~/.bashrc 2>/dev/null || true
    . ~/.zshrc 2>/dev/null || true

    DREAMINA_BIN=$(command -v dreamina || find "$HOME" -maxdepth 4 -type f -name dreamina 2>/dev/null | head -n 1)
    if [ -z "$DREAMINA_BIN" ]; then
        echo "安装后未找到 dreamina CLI。"
        echo ""
        echo "日志: $LOG_PATH"
        echo "按 Enter 键关闭..."
        read -r
        exit 3
    fi

    echo "dreamina 已安装: $DREAMINA_BIN"
    $DREAMINA_BIN -h >/dev/null 2>&1 || true
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

    echo "是否立即登录？(y/N): "
    read -r ANSWER
    if [ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ]; then
        open "$PWD/登录即梦CLI.command"
    fi

    echo ""
    echo "完成。"
    echo ""
    echo "日志: $LOG_PATH"
    echo "按 Enter 键关闭..."
    read -r
} 2>&1 | tee -a "$LOG_PATH"
