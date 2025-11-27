#!/bin/bash

###################################################################
# 验证任务结果
# 
# 用法: ./verify_results.sh <TASK_ID>
###################################################################

TASK_ID=$1

if [ -z "$TASK_ID" ]; then
    echo "用法: ./verify_results.sh <TASK_ID>"
    exit 1
fi

echo "════════════════════════════════════════════════════════════"
echo "  🔍 验证任务结果: $TASK_ID"
echo "════════════════════════════════════════════════════════════"
echo

RESULT_DIR="../backend/storage/backtest-results/$TASK_ID"

# 1. 检查结果目录
echo "【步骤1】检查结果目录..."
if [ -d "$RESULT_DIR" ]; then
    echo "✅ 结果目录存在: $RESULT_DIR"
    ls -lh "$RESULT_DIR"
else
    echo "❌ 结果目录不存在"
    exit 1
fi

echo

# 2. 检查trades文件
echo "【步骤2】检查trades.parquet..."
cd "$(dirname "$0")"
source venv/bin/activate

python3 << EOF
import pandas as pd
import os
from pathlib import Path

task_id = "$TASK_ID"
result_dir = Path("../backend/storage/backtest-results") / task_id

# 查找trades文件
trades_files = list(result_dir.glob("trades_*.parquet"))

if not trades_files:
    print("❌ 未找到trades文件")
    exit(1)

trades_file = trades_files[0]
print(f"✅ Trades文件: {trades_file.name}")
print(f"📦 文件大小: {trades_file.stat().st_size:,} bytes")
print()

# 读取内容
df = pd.read_parquet(trades_file)
print(f"📊 交易记录数: {len(df)}")

if len(df) > 0:
    print()
    print("✅ 成功！Trades文件包含交易记录")
    print()
    print("【字段列表】")
    for col in df.columns:
        print(f"  - {col}")
    
    print()
    print("【前3条记录】")
    print(df.head(3).to_string())
    
    print()
    print("【统计信息】")
    if 'pnl' in df.columns:
        print(f"  总盈亏: {df['pnl'].sum():.2f}")
        print(f"  盈利交易: {(df['pnl'] > 0).sum()}")
        print(f"  亏损交易: {(df['pnl'] < 0).sum()}")
        print(f"  平均盈亏: {df['pnl'].mean():.2f}")
    
    if 'pnl_percent' in df.columns:
        print(f"  平均收益率: {df['pnl_percent'].mean():.2f}%")
else:
    print("❌ Trades文件为空（0条记录）")
    print()
    print("可能的原因:")
    print("  - 策略条件未满足，没有生成交易信号")
    print("  - FactorCollector配对失败")
    print("  - 数据时间范围太短")
    exit(1)
EOF

echo
echo "════════════════════════════════════════════════════════════"
echo "  ✅ 验证完成"
echo "════════════════════════════════════════════════════════════"

