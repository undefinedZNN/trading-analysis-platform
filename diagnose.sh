#!/bin/bash

echo "=========================================="
echo "诊断报告 - 任务未执行问题"
echo "=========================================="
echo ""

echo "1. Backend状态："
curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Backend运行正常 (端口3000)"
else
    echo "   ❌ Backend未响应"
fi
echo ""

echo "2. RabbitMQ状态："
curl -s http://localhost:15672/ > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ RabbitMQ管理界面可访问 (端口15672)"
else
    echo "   ❌ RabbitMQ管理界面不可访问"
fi
echo ""

echo "3. Worker进程："
WORKER_PID=$(ps aux | grep "start_rabbitmq_worker" | grep -v grep | awk '{print $2}')
if [ -n "$WORKER_PID" ]; then
    echo "   ✅ Worker运行中 (PID: $WORKER_PID)"
else
    echo "   ❌ Worker未运行"
fi
echo ""

echo "4. 任务状态："
TASK_ID="09588758-54d7-45ea-b7a5-80c04fad96f6"
TASK_STATUS=$(curl -s "http://localhost:3000/api/v1/backtesting/tasks/$TASK_ID" | jq -r '.status')
echo "   任务ID: $TASK_ID"
echo "   状态: $TASK_STATUS"
echo ""

echo "5. Backend RabbitMQ配置："
echo "   从.env文件读取："
grep "^RABBITMQ_" /Volumes/CODE/trading-analysis-platform/backend/.env | while read line; do
    echo "   $line"
done
echo ""

echo "=========================================="
echo "问题诊断："
echo "=========================================="

if [ "$TASK_STATUS" == "pending" ]; then
    echo "⚠️  任务处于pending状态，未开始执行"
    echo ""
    echo "可能原因："
    echo "1. RabbitMQ连接失败（Backend无法发送消息）"
    echo "2. Worker无法消费消息"
    echo ""
    echo "建议操作："
    echo "1. 检查Backend日志是否有RabbitMQ连接错误"
    echo "2. 修改.env文件使用guest用户："
    echo "   RABBITMQ_USERNAME=guest"
    echo "   RABBITMQ_PASSWORD=guest"
    echo "   RABBITMQ_VHOST=/"
    echo "3. 重启Backend"
fi

echo ""
echo "=========================================="
echo "快速修复命令："
echo "=========================================="
echo ""
echo "# 1. 备份当前配置"
echo "cp /Volumes/CODE/trading-analysis-platform/backend/.env /Volumes/CODE/trading-analysis-platform/backend/.env.backup"
echo ""
echo "# 2. 修改RabbitMQ配置（手动编辑.env文件）"
echo "# 将RABBITMQ_USERNAME改为guest"
echo "# 将RABBITMQ_PASSWORD改为guest"
echo "# 将RABBITMQ_VHOST改为/"
echo ""
echo "# 3. 重启Backend（在Backend目录的终端中）"
echo "# Ctrl+C停止，然后："
echo "npm run start:dev"
echo ""

