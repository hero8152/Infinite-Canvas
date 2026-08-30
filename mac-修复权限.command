#!/bin/bash
# 修复 macOS Gatekeeper 安全限制
# 运行此脚本后，双击 .command 文件就不会再提示权限问题了

cd "$(dirname "$0")"

echo "============================================"
echo "   修复 macOS 安全限制"
echo "============================================"
echo ""

# 移除下载文件的 quarantine 属性（这是阻止运行的主要原因）
# 修正：原脚本引用了不存在的 启动服务.command/启动服务.py/mac-*.sh，
# 改为覆盖项目中实际存在的文件。
echo "正在移除安全限制..."

xattr -r -d com.apple.quarantine mac-启动服务.command 2>/dev/null
xattr -r -d com.apple.quarantine mac-修复权限.command 2>/dev/null
xattr -r -d com.apple.quarantine 安装即梦CLI.command 2>/dev/null
xattr -r -d com.apple.quarantine 登录即梦CLI.command 2>/dev/null
xattr -r -d com.apple.quarantine main.py 2>/dev/null

echo "✓ 已移除安全限制"
echo ""

# 设置执行权限
chmod +x mac-启动服务.command 2>/dev/null
chmod +x mac-修复权限.command 2>/dev/null
chmod +x 安装即梦CLI.command 2>/dev/null
chmod +x 登录即梦CLI.command 2>/dev/null
chmod +x main.py 2>/dev/null

echo "✓ 已设置执行权限"
echo ""

echo "============================================"
echo "   修复完成！"
echo "============================================"
echo ""
echo "现在可以正常双击 'mac-启动服务.command' 了。"
echo ""
echo "如果仍然提示权限问题，请到："
echo "系统设置 → 隐私与安全性 → 点击'仍要打开'"
echo ""
read -p "按 Enter 键退出..."
