#!/bin/bash

echo "=========================================="
echo "自动修复RabbitMQ配置"
echo "=========================================="
echo ""

ENV_FILE="/Volumes/CODE/trading-analysis-platform/backend/.env"

# 1. 备份
echo "1. 备份当前配置..."
cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
echo "   ✅ 备份完成: $ENV_FILE.backup.*"
echo ""

# 2. 修改配置
echo "2. 修改RabbitMQ配置..."
sed -i.tmp 's/^RABBITMQ_VHOST=.*/RABBITMQ_VHOST=\//' "$ENV_FILE"
sed -i.tmp 's/^RABBITMQ_USERNAME=.*/RABBITMQ_USERNAME=guest/' "$ENV_FILE"
sed -i.tmp 's/^RABBITMQ_PASSWORD=.*/RABBITMQ_PASSWORD=guest/' "$ENV_FILE"
rm -f "$ENV_FILE.tmp"
echo "   ✅ 配置已更新"
echo ""

# 3. 显示新配置
echo "3. 新的RabbitMQ配置："
grep "^RABBITMQ_" "$ENV_FILE" | while read line; do
    echo "   $line"
done
echo ""

echo "=========================================="
echo "✅ 修复完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 重启Backend（在Backend终端中Ctrl+C，然后npm run start:dev）"
echo "2. 重新执行任务"
echo ""

