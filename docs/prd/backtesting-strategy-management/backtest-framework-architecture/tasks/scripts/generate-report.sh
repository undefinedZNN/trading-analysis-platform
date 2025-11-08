#!/bin/bash
# 生成进度报告

set -e

TASKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_FILE="$TASKS_DIR/progress-report-$(date +%Y%m%d).md"

cat > "$REPORT_FILE" << 'EOF'
# 回测框架开发进度报告

生成时间：$(date +"%Y-%m-%d %H:%M:%S")

## 总体进度

EOF

# 添加进度统计
bash "$(dirname "$0")/update-progress.sh" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << 'EOF'

## 详细任务状态

EOF

# 遍历所有任务文档
for milestone in M1 M2 M3 M4; do
    echo "### $milestone" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    for file in "$TASKS_DIR"/${milestone}-*.md; do
        if [ -f "$file" ]; then
            task_id=$(basename "$file" .md)
            status=$(grep "**状态**:" "$file" | head -1 | sed 's/.*: //')
            owner=$(grep "**负责人**:" "$file" | head -1 | sed 's/.*: //')
            
            echo "- **$task_id**: $status | 负责人: $owner" >> "$REPORT_FILE"
        fi
    done
    
    echo "" >> "$REPORT_FILE"
done

echo "✅ 报告已生成: $REPORT_FILE"

