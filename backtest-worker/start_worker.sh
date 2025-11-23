#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#     Worker 快速启动脚本
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "    🚀 启动 Backtest Worker"
echo "═══════════════════════════════════════════════════════════════"
echo

# 1. 检查 Python 环境
echo "📋 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "✅ $PYTHON_VERSION"
echo

# 2. 进入 Worker 目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
echo "📁 工作目录: $SCRIPT_DIR"
echo

# 3. 激活虚拟环境
echo "🔧 激活虚拟环境..."
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✅ 虚拟环境已激活"
else
    echo "⚠️  虚拟环境不存在，正在创建..."
    python3 -m venv venv
    source venv/bin/activate
    echo "✅ 虚拟环境已创建并激活"
fi
echo

# 4. 安装依赖
echo "📦 检查依赖..."
if ! python -c "import requests" 2>/dev/null; then
    echo "⚠️  安装缺失的依赖..."
    pip install requests psutil --quiet
fi
echo "✅ 依赖已就绪"
echo

# 5. 检查 Backend 连接
echo "🔌 检查 Backend 连接..."
if curl -s http://localhost:3000/api/v1/backtesting/workers > /dev/null; then
    echo "✅ Backend 连接正常"
else
    echo "❌ 无法连接到 Backend"
    echo "   请先启动 Backend: cd ../backend && npm run start:dev"
    exit 1
fi
echo

# 6. 启动 Worker
echo "═══════════════════════════════════════════════════════════════"
echo "    🎯 启动 Worker 注册服务"
echo "═══════════════════════════════════════════════════════════════"
echo
python register_worker.py

