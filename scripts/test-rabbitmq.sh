#!/bin/bash
# RabbitMQ集成测试脚本

set -e

echo "=================================="
echo "RabbitMQ集成测试"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试步骤
step=1

print_step() {
    echo ""
    echo -e "${YELLOW}步骤 $step: $1${NC}"
    ((step++))
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 1. 检查RabbitMQ是否运行
print_step "检查RabbitMQ服务"
if docker ps | grep -q rabbitmq; then
    print_success "RabbitMQ容器正在运行"
else
    print_error "RabbitMQ容器未运行"
    echo "启动RabbitMQ容器..."
    docker run -d --name rabbitmq \
      -p 5672:5672 \
      -p 15672:15672 \
      -e RABBITMQ_DEFAULT_USER=dev \
      -e RABBITMQ_DEFAULT_PASS=devpass \
      -e RABBITMQ_DEFAULT_VHOST=/backtest \
      rabbitmq:3-management
    echo "等待RabbitMQ启动..."
    sleep 10
    print_success "RabbitMQ已启动"
fi

# 2. 检查RabbitMQ连接
print_step "检查RabbitMQ连接"
if curl -s -u dev:devpass http://localhost:15672/api/overview > /dev/null 2>&1; then
    print_success "RabbitMQ API可访问"
else
    print_error "无法连接到RabbitMQ API"
    exit 1
fi

# 3. 检查虚拟主机
print_step "检查虚拟主机 /backtest"
if curl -s -u dev:devpass http://localhost:15672/api/vhosts/%2Fbacktest | grep -q "backtest"; then
    print_success "虚拟主机 /backtest 存在"
else
    print_error "虚拟主机 /backtest 不存在"
    echo "创建虚拟主机..."
    curl -s -u dev:devpass -X PUT http://localhost:15672/api/vhosts/%2Fbacktest
    print_success "虚拟主机已创建"
fi

# 4. 检查Exchange
print_step "检查Exchange (backtest)"
sleep 2
if curl -s -u dev:devpass http://localhost:15672/api/exchanges/%2Fbacktest/backtest | grep -q "backtest"; then
    print_success "Exchange 'backtest' 存在"
else
    echo "Exchange将在Backend启动时自动创建"
fi

# 5. 检查队列
print_step "检查队列"
queues=(
    "backtest.task"
    "backtest.task.cancel"
    "backtest.progress"
    "backtest.status"
    "backtest.result"
    "backtest.error"
    "backtest.log"
    "worker.heartbeat"
)

for queue in "${queues[@]}"; do
    if curl -s -u dev:devpass "http://localhost:15672/api/queues/%2Fbacktest/$queue" | grep -q "$queue"; then
        print_success "队列 '$queue' 存在"
    else
        echo "队列 '$queue' 将在Backend启动时自动创建"
    fi
done

# 6. 检查Backend配置
print_step "检查Backend配置"
if [ -f "backend/.env" ]; then
    if grep -q "USE_RABBITMQ=true" backend/.env; then
        print_success "Backend已配置使用RabbitMQ"
    else
        print_error "Backend未配置使用RabbitMQ"
        echo "请在 backend/.env 中设置 USE_RABBITMQ=true"
    fi
else
    print_error "backend/.env 文件不存在"
    echo "请创建配置文件并设置 USE_RABBITMQ=true"
fi

# 7. 检查Worker依赖
print_step "检查Worker依赖"
if [ -f "backtest-worker/venv/bin/python" ]; then
    if backtest-worker/venv/bin/python -c "import pika" 2>/dev/null; then
        print_success "Worker已安装pika库"
    else
        print_error "Worker未安装pika库"
        echo "运行: cd backtest-worker && source venv/bin/activate && pip install pika"
    fi
else
    print_error "Worker虚拟环境不存在"
    echo "运行: cd backtest-worker && python -m venv venv"
fi

# 8. 生成测试报告
print_step "生成测试报告"

echo ""
echo "=================================="
echo "测试总结"
echo "=================================="
echo ""
echo "RabbitMQ管理界面: http://localhost:15672"
echo "用户名: dev"
echo "密码: devpass"
echo ""
echo "下一步:"
echo "1. 启动Backend: cd backend && npm run start:dev"
echo "2. 启动Worker: cd backtest-worker && python start_rabbitmq_worker.py"
echo "3. 创建测试任务验证端到端通信"
echo ""

print_success "测试脚本执行完成"




