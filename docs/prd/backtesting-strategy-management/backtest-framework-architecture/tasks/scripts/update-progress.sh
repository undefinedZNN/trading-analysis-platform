#!/bin/bash
# 更新任务进度脚本

set -e

TASKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASHBOARD="$TASKS_DIR/DASHBOARD.md"

echo "📊 更新任务进度..."

# 统计各状态的任务数
count_status() {
    local status=$1
    grep -c "**状态**: 🔴 $status" "$TASKS_DIR"/M*.md 2>/dev/null || echo "0"
}

PENDING=$(count_status "Pending")
IN_PROGRESS=$(grep -c "**状态**: 🟡 In Progress" "$TASKS_DIR"/M*.md 2>/dev/null || echo "0")
REVIEW=$(grep -c "**状态**: 🟢 Review" "$TASKS_DIR"/M*.md 2>/dev/null || echo "0")
DONE=$(grep -c "**状态**: ✅ Done" "$TASKS_DIR"/M*.md 2>/dev/null || echo "0")
TOTAL=13

COMPLETED_PCT=$(echo "scale=0; $DONE * 100 / $TOTAL" | bc)

echo "总任务数: $TOTAL"
echo "待开始: $PENDING"
echo "进行中: $IN_PROGRESS"
echo "评审中: $REVIEW"
echo "已完成: $DONE"
echo "完成率: ${COMPLETED_PCT}%"

echo ""
echo "✅ 进度已更新"

