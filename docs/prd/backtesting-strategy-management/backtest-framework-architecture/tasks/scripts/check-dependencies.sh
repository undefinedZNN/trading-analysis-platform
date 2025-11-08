#!/bin/bash
# 检查任务依赖关系

set -e

TASKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔍 检查任务依赖关系..."
echo ""

# 定义依赖关系
declare -A dependencies=(
    ["M1-03"]="M1-01"
    ["M2-01"]="M1-04"
    ["M2-02"]="M1-04"
    ["M2-03"]="M1-04"
    ["M2-04"]="M2-03"
    ["M3-01"]="M2-01 M2-02"
    ["M3-02"]="M3-01"
    ["M3-03"]="M2-04"
    ["M4-01"]="M3-02 M3-03"
    ["M4-02"]="M4-01"
)

get_status() {
    local task=$1
    local file="$TASKS_DIR/$task.md"
    if [ -f "$file" ]; then
        grep "**状态**:" "$file" | head -1 | sed 's/.*🔴 //' | sed 's/.*🟡 //' | sed 's/.*🟢 //' | sed 's/.*✅ //' | tr -d ' '
    else
        echo "NotFound"
    fi
}

check_can_start() {
    local task=$1
    local deps=${dependencies[$task]}
    
    if [ -z "$deps" ]; then
        echo "✅ $task: 无依赖，可以开始"
        return 0
    fi
    
    local all_done=true
    for dep in $deps; do
        local dep_status=$(get_status "$dep")
        if [ "$dep_status" != "Done" ]; then
            all_done=false
            echo "⚠️  $task: 等待 $dep 完成（当前状态: $dep_status）"
        fi
    done
    
    if $all_done; then
        echo "✅ $task: 所有依赖已完成，可以开始"
    fi
}

# 检查所有任务
for task in "${!dependencies[@]}"; do
    check_can_start "$task"
done

echo ""
echo "✅ 依赖关系检查完成"

