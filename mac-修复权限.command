#!/bin/bash
# 修复 macOS Gatekeeper 安全限制
cd "$(dirname "$0")"

echo "============================================"
echo " 修复 macOS 安全限制"
echo "============================================"
echo ""

echo "正在移除安全限制..."
xattr -r -d com.apple.quarantine mac-启动服务.command 2>/dev/null
xattr -r -d com.apple.quarantine mac-修复权限.command 2>/dev/null
xattr -r -d com.apple.quarantine mac-安装依赖.sh 2>/dev/null
xattr -r -d com.apple.quarantine mac-启动服务.sh 2>/dev/null
xattr -r -d com.apple.quarantine 安装即梦CLI.command 2>/dev/null
xattr -r -d com.apple.quarantine 登录即梦CLI.command 2>/dev/null
xattr -r -d com.apple.quarantine main.py 2>/dev/null

echo "✓ 已移除安全限制"
echo ""

echo "正在设置执行权限..."
chmod +x mac-启动服务.command 2>/dev/null
chmod +x mac-修复权限.command 2>/dev/null
chmod +x mac-安装依赖.sh 2>/dev/null
chmod +x mac-启动服务.sh 2>/dev/null
chmod +x 安装即梦CLI.command 2>/dev/null
chmod +x 登录即梦CLI.command 2>/dev/null
chmod +x main.py 2>/dev/null

echo "✓ 已设置执行权限"
echo ""
echo "修复完成！现在可以正常双击 'mac-启动服务.command'。"
read -p "按 Enter 键退出..."
