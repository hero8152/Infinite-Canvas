#!/bin/bash
# 修复权限并启动服务
# 双击运行即可

cd "$(dirname "$0")"

# 加载用户 shell 配置（确保代理等环境变量可用）
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null
[ -f "$HOME/.bash_profile" ] && source "$HOME/.bash_profile" 2>/dev/null
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null

echo "============================================"
echo "   ComfyUI-API-Modelscope"
echo "============================================"
echo ""
echo "修复权限中..."

# 移除安全限制（只针对实际存在的文件类型）
xattr -r -d com.apple.quarantine *.command 2>/dev/null
xattr -r -d com.apple.quarantine main.py 2>/dev/null

# 设置执行权限（修正：原脚本引用了不存在的 启动服务.command/启动服务.py）
chmod +x *.command 2>/dev/null
chmod +x main.py 2>/dev/null

echo "权限已修复！"
echo ""

# 检查并安装 socksio（系统代理使用 SOCKS5 时 httpx 需要此包）
PYTHON_BIN=""
if [ -x /opt/homebrew/bin/python3 ]; then
    PYTHON_BIN="/opt/homebrew/bin/python3"
elif [ -x /usr/local/bin/python3 ]; then
    PYTHON_BIN="/usr/local/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
fi
if [ -n "$PYTHON_BIN" ]; then
    if ! $PYTHON_BIN -c "import socksio" 2>/dev/null; then
        echo "检测到缺少 socksio 依赖（SOCKS 代理需要），正在安装..."
        $PYTHON_BIN -m pip install socksio -q 2>/dev/null
        echo "socksio 安装完成！"
        echo ""
    fi
fi

# 清理占用 3000 端口的旧进程，避免 address already in use
OLD_PID=$(lsof -ti :3000 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "检测到 3000 端口被占用，正在停止旧进程 (PID: $OLD_PID)..."
    kill $OLD_PID 2>/dev/null
    sleep 1
    # 仍未退出则强制结束
    if lsof -ti :3000 >/dev/null 2>&1; then
        kill -9 $(lsof -ti :3000) 2>/dev/null
    fi
    echo "旧进程已停止。"
    echo ""
fi

echo "正在启动服务..."
echo "本机访问： http://127.0.0.1:3000/"
echo "============================================"
echo ""

# 后台延迟3秒自动打开浏览器（等服务器启动完成）
(sleep 3 && open "http://127.0.0.1:3000/") &

# 优先使用 Homebrew Python，避免部分工具管理的 Python 签名问题
if [ -x /opt/homebrew/bin/python3 ]; then
    /opt/homebrew/bin/python3 main.py
elif [ -x /usr/local/bin/python3 ]; then
    /usr/local/bin/python3 main.py
elif command -v python3 >/dev/null 2>&1; then
    python3 main.py
else
    echo "错误：找不到 Python3，请先安装 Python 3.10+："
    echo "https://www.python.org/downloads/"
    read -p "按 Enter 键退出..."
    exit 1
fi
