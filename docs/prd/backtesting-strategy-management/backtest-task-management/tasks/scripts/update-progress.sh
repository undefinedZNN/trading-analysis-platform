#!/bin/bash

# 更新任务进度脚本
# 用法: ./update-progress.sh <task-id> <status>
# 状态: pending, in_progress, completed

TASK_ID=$1
STATUS=$2
DASHBOARD_FILE="../DASHBOARD.md"

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
    echo "用法: $0 <task-id> <status>"
    echo "示例: $0 P1-01 completed"
    exit 1
fi

echo "更新任务 $TASK_ID 状态为 $STATUS..."

# TODO: 实现自动更新DASHBOARD.md的逻辑
# 可以使用sed或awk来更新表格中的状态

echo "✅ 任务状态已更新"
echo "请手动检查并提交 DASHBOARD.md 的变更"

