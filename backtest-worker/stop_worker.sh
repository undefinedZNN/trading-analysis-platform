#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#     Worker 停止脚本
# ═══════════════════════════════════════════════════════════════

echo "════════════════════════════════════════════════════════════════"
echo "    🛑 停止 Backtest Worker"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 查找Worker进程
echo "📋 查找Worker进程..."
WORKER_PIDS=$(ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | awk '{print $2}')

if [ -z "$WORKER_PIDS" ]; then
    echo "ℹ️  没有运行中的Worker进程"
    echo ""
    exit 0
fi

# 显示找到的进程
echo "找到以下Worker进程："
ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | awk '{printf "  - PID: %s, CPU: %s%%, Memory: %s%%\n", $2, $3, $4}'
echo ""

# 询问确认（可以用-f参数跳过）
if [ "$1" != "-f" ] && [ "$1" != "--force" ]; then
    read -p "确认停止所有Worker? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 取消操作"
        exit 1
    fi
fi

# 停止Worker
echo "🛑 正在停止Worker..."
for pid in $WORKER_PIDS; do
    echo "  终止进程 $pid..."
    kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
done

# 等待进程终止
sleep 2

# 验证是否成功
REMAINING=$(ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | wc -l)
if [ $REMAINING -eq 0 ]; then
    echo "✅ 所有Worker进程已成功停止"
else
    echo "⚠️  仍有 $REMAINING 个进程未停止，尝试强制终止..."
    pkill -9 -f "start_rabbitmq_worker.py"
    sleep 1
    
    FINAL_CHECK=$(ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | wc -l)
    if [ $FINAL_CHECK -eq 0 ]; then
        echo "✅ 强制终止成功"
    else
        echo "❌ 无法终止某些进程，请手动检查"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

