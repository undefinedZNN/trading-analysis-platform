#!/bin/bash

###################################################################
# 验证交易记录修复
# 
# 此脚本会：
# 1. 重启Worker（应用修复）
# 2. 等待Worker启动
# 3. 提示用户创建测试任务
# 4. 监控结果
###################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "════════════════════════════════════════════════════════════"
echo "  🔧 验证交易记录修复"
echo "════════════════════════════════════════════════════════════"
echo

# 1. 停止所有Worker
echo "【步骤1】停止现有Worker进程..."
./manage_worker.sh kill
sleep 2

# 2. 清理RabbitMQ队列
echo
echo "【步骤2】清理RabbitMQ队列..."
python3 purge_all_queues.py
echo "✅ 队列已清理"

# 3. 启动Worker
echo
echo "【步骤3】启动Worker（应用修复）..."
./manage_worker.sh start
echo "⏳ 等待Worker启动..."
sleep 3

# 4. 检查Worker状态
echo
echo "【步骤4】检查Worker状态..."
./manage_worker.sh status

# 5. 提示用户
echo
echo "════════════════════════════════════════════════════════════"
echo "  ✅ Worker已启动（已应用修复）"
echo "════════════════════════════════════════════════════════════"
echo
echo "📋 关键修复："
echo "   1. FactorCollector.set_strategy(self) 已添加"
echo "   2. record_exit_factors() 参数已优化"
echo "   3. 添加了更多日志输出"
echo
echo "🧪 测试步骤："
echo "   1. 从前端创建一个新的回测任务"
echo "   2. 选择小数据集（如：1天的5m数据）"
echo "   3. 等待任务完成"
echo "   4. 运行验证命令："
echo
echo "      # 检查任务结果"
echo "      bash verify_results.sh <TASK_ID>"
echo
echo "预期结果："
echo "   ✅ 日志中不再有 'Strategy not set' 警告"
echo "   ✅ 日志中不再有 'Entry order for exit order XXX not found' 警告"
echo "   ✅ trades.parquet 文件有交易记录"
echo "   ✅ 任务完成时总交易次数 > 0"
echo
echo "════════════════════════════════════════════════════════════"

