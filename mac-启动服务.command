#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo " Infinite Canvas macOS 启动器"
echo "============================================"
echo ""

echo "修复权限中..."
xattr -r -d com.apple.quarantine *.command 2>/dev/null
xattr -r -d com.apple.quarantine mac-*.sh 2>/dev/null
xattr -r -d com.apple.quarantine main.py 2>/dev/null
chmod +x *.command 2>/dev/null
chmod +x mac-*.sh 2>/dev/null
chmod +x main.py 2>/dev/null

echo "权限已修复！"
echo "本机访问： http://127.0.0.1:3000"
echo ""

if [ -x "./mac-启动服务.sh" ]; then
    ./mac-启动服务.sh
elif [ -x /opt/homebrew/bin/python3 ]; then
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
