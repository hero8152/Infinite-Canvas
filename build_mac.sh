#!/bin/bash
#
# Infinite Canvas - macOS 打包脚本
# 使用 PyInstaller 将项目打包为独立 .app 应用
#

set -e

echo "============================================"
echo "   Infinite Canvas - macOS 打包工具"
echo "============================================"
echo ""

# 检查 Python 版本
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python 版本: $PYTHON_VERSION"

# 检查并安装依赖
echo ""
echo "[1/4] 安装项目依赖..."
pip3 install -r requirements.txt

echo ""
echo "[2/4] 安装 PyInstaller..."
pip3 install pyinstaller

echo ""
echo "[3/4] 开始打包..."
echo ""

# 检查图标文件
ICON_PARAM=""
if [ -f "static/images/icon.icns" ]; then
    ICON_PARAM="--icon static/images/icon.icns"
    echo "使用自定义图标: static/images/icon.icns"
else
    echo "提示: 未找到 icon.icns，将使用默认图标"
    echo "如需自定义图标，请将 .icns 文件放置在 static/images/icon.icns"
fi

# 使用 PyInstaller 打包
pyinstaller \
    --name "Infinite Canvas" \
    --windowed \
    --onedir \
    $ICON_PARAM \
    --add-data "static:static" \
    --add-data "workflows:workflows" \
    --add-data "tools:tools" \
    --add-data "VERSION:." \
    --add-data "requirements.txt:." \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --noconfirm \
    --clean \
    main.py

echo ""
echo "[4/4] 打包完成！"
echo ""
echo "输出目录: dist/Infinite Canvas/"
echo "应用位置: dist/Infinite Canvas/Infinite Canvas.app"
echo ""
echo "运行方式:"
echo "  1. 双击 dist/Infinite Canvas/Infinite Canvas.app"
echo "  2. 或终端运行: open 'dist/Infinite Canvas/Infinite Canvas.app'"
echo ""
echo "创建 DMG 安装包:"
echo "  hdiutil create -volname 'Infinite Canvas' -srcfolder 'dist/Infinite Canvas' -ov -format UDZO 'dist/Infinite Canvas.dmg'"
echo ""
