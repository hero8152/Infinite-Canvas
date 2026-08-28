#!/usr/bin/env bash
# Infinite-Canvas  Linux 依赖安装脚本
# 用法：bash install.sh
# 作用：安装 Python 支撑包（Pillow 等需要系统图像库）与项目中 requirements.txt 声明的 Python 依赖。
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Infinite-Canvas Linux 依赖安装"
echo "==> 检测 Python3..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "未找到 python3，请先安装 Python 3.9+（例如 sudo apt install python3 python3-pip python3-venv）" >&2
    exit 1
fi
echo "==> Python3: $(python3 --version)"

# 用系统包管理器安装 Pillow 需要的底层图像库（不同发行版名称略有差异，尽可能多装不冲突）
echo "==> 安装系统依赖（图像库等）..."
PKG_MGR=""
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
elif command -v yum >/dev/null 2>&1; then
    PKG_MGR="yum"
fi
case "$PKG_MGR" in
    apt)
        sudo apt-get update
        sudo apt-get install -y \
            python3-venv python3-pip \
            libjpeg-dev libpng-dev zlib1g-dev libtiff-dev \
            libfreetype6-dev liblcms2-dev libwebp-dev libopenjp2-7-dev
        ;;
    dnf|yum)
        sudo "$PKG_MGR" install -y \
            python3-pip \
            libjpeg-turbo-devel libpng-devel zlib-devel libtiff-devel \
            freetype-devel lcms2-devel libwebp-devel openjpeg2-devel
        ;;
    *)
        echo "未识别的包管理器，跳过系统依赖安装；若 Pillow 编译失败请手动安装图像库。" >&2
        ;;
esac

echo "==> 创建虚拟环境 .venv..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> 升级 pip 并安装 Python 依赖..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo ""
echo "==> 依赖安装完成。请运行：bash start.sh"
