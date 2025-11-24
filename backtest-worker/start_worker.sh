#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#     Worker 快速启动脚本（注册 + RabbitMQ 消费）
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "    🚀 启动 Backtest Worker（注册 + RabbitMQ）"
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

# 4. 安装依赖（补齐 pika 及常用依赖）
echo "📦 检查依赖..."
NEED_INSTALL=0
python - <<'PY'
import importlib, sys
missing = []
for pkg in ["requests", "psutil", "pika", "backtrader", "pandas", "pyarrow", "duckdb"]:
    try:
        importlib.import_module(pkg)
    except ImportError:
        missing.append(pkg)
if missing:
    print("MISSING:" + ",".join(missing))
    sys.exit(1)
PY
if [ $? -ne 0 ]; then
    echo "⚠️  安装缺失的依赖..."
    pip install --quiet requests psutil pika backtrader pandas pyarrow duckdb
fi
echo "✅ 依赖已就绪"
echo

# 5. 注册 Worker（写入环境变量 WORKER_ID，便于后续心跳/消费使用）
echo "🔌 注册 Worker..."
export WORKER_ID=$(
python - <<'PY'
import requests, uuid, platform

BACKEND_URL = "http://localhost:3000/api/v1/internal/workers/register"
worker_id = str(uuid.uuid4())
payload = {
    "workerId": worker_id,
    "host": platform.node() or "localhost",
    "port": 50051,
    "capabilities": {
        "maxConcurrentTasks": 2,
        "supportedStrategies": ["backtrader", "custom"]
    }
}
try:
    resp = requests.post(BACKEND_URL, json=payload, timeout=5)
    if resp.status_code in (200, 201):
        print(worker_id)
    else:
        raise RuntimeError(f"register failed: {resp.status_code} {resp.text}")
except Exception as e:
    raise SystemExit(f"❌ Worker 注册失败: {e}")
PY
)
if [ -z "$WORKER_ID" ]; then
    echo "❌ Worker 注册失败，退出"
    exit 1
fi
echo "✅ Worker 注册成功，ID: $WORKER_ID"
echo

# 6. 启动 Worker（RabbitMQ 消费），用 exec 保留 Ctrl+C 行为
echo "═══════════════════════════════════════════════════════════════"
echo "    🎯 启动 Worker（消费 backtest.task 队列）"
echo "═══════════════════════════════════════════════════════════════"
echo
exec env WORKER_ID="$WORKER_ID" python start_rabbitmq_worker.py
