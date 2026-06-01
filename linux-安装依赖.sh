#!/bin/bash

cd "$(dirname "$0")"

echo "============================================"
echo "   Installing dependencies for Linux"
echo "============================================"
echo ""

if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] Python 3 not found. Please install Python 3.10+ first."
    exit 1
fi

PYTHON_BIN="python3"

if [ -x ".venv/bin/python" ]; then
    PYTHON_BIN="$PWD/.venv/bin/python"
    echo "Using existing virtual environment: .venv"
else
    echo "Creating virtual environment: .venv"
    if python3 -m venv .venv >/dev/null 2>&1; then
        PYTHON_BIN="$PWD/.venv/bin/python"
    else
        echo "[WARN] Failed to create .venv, falling back to system python3."
        echo "[WARN] On Debian/Ubuntu you may need: sudo apt install python3-venv"
    fi
fi

echo "Python: $("$PYTHON_BIN" --version 2>/dev/null)"
echo ""
echo "[1/3] Checking pip..."
"$PYTHON_BIN" -m pip --version >/dev/null 2>&1 || "$PYTHON_BIN" -m ensurepip --upgrade

echo "[2/3] Upgrading pip..."
"$PYTHON_BIN" -m pip install --upgrade pip

echo "[3/3] Installing project dependencies..."
"$PYTHON_BIN" -m pip install -r requirements.txt

echo ""
echo "Done."
if [ -x ".venv/bin/python" ]; then
    echo "Start with: ./linux-启动服务.sh"
    echo "Manual shell activation: source .venv/bin/activate"
else
    echo "Start with: ./linux-启动服务.sh"
fi
