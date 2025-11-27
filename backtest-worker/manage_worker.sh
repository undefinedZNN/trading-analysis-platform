#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#     Worker 管理脚本
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    🔧 Backtest Worker 管理工具"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "用法: $0 <命令> [选项]"
    echo ""
    echo "命令:"
    echo "  start          启动Worker"
    echo "  stop           停止Worker"
    echo "  restart        重启Worker"
    echo "  status         查看Worker状态"
    echo "  logs           查看Worker日志"
    echo "  kill           强制杀死Worker进程"
    echo ""
    echo "选项:"
    echo "  -f, --force    强制执行（不询问确认）"
    echo "  -h, --help     显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start           # 启动Worker"
    echo "  $0 stop            # 停止Worker（需确认）"
    echo "  $0 stop -f         # 强制停止Worker（不确认）"
    echo "  $0 status          # 查看状态"
    echo ""
}

# 检查Worker状态
check_status() {
    WORKER_PIDS=$(ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | awk '{print $2}')
    
    if [ -z "$WORKER_PIDS" ]; then
        return 1  # 未运行
    else
        return 0  # 运行中
    fi
}

# 显示Worker状态
show_status() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    📊 Worker 状态"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    if check_status; then
        echo -e "${GREEN}✅ Worker 运行中${NC}"
        echo ""
        echo "进程详情:"
        ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | \
            awk '{printf "  PID: %s\n  CPU: %s%%\n  Memory: %s%%\n  Time: %s\n", $2, $3, $4, $10}'
        echo ""
        
        # 获取Worker注册信息
        echo "注册信息:"
        WORKER_COUNT=$(curl -s http://localhost:3000/api/v1/internal/workers 2>/dev/null | \
            python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
        
        if [ ! -z "$WORKER_COUNT" ]; then
            echo "  已注册: ${WORKER_COUNT} 个Worker"
        else
            echo "  ⚠️  无法获取注册信息（Backend可能未运行）"
        fi
    else
        echo -e "${RED}❌ Worker 未运行${NC}"
    fi
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
}

# 启动Worker
start_worker() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    🚀 启动 Worker"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    if check_status; then
        echo -e "${YELLOW}⚠️  Worker 已在运行中${NC}"
        echo ""
        show_status
        return 1
    fi
    
    echo "正在启动Worker..."
    cd "$SCRIPT_DIR"
    
    LOG_FILE="$SCRIPT_DIR/logs/worker-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$SCRIPT_DIR/logs"
    
    ./start_worker.sh > "$LOG_FILE" 2>&1 &
    
    echo "等待Worker启动..."
    sleep 3
    
    if check_status; then
        echo -e "${GREEN}✅ Worker 启动成功${NC}"
        echo "日志文件: $LOG_FILE"
        echo ""
        show_status
    else
        echo -e "${RED}❌ Worker 启动失败${NC}"
        echo "请查看日志: $LOG_FILE"
        return 1
    fi
}

# 停止Worker
stop_worker() {
    local FORCE=$1
    
    echo "════════════════════════════════════════════════════════════════"
    echo "    🛑 停止 Worker"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    if ! check_status; then
        echo -e "${YELLOW}ℹ️  Worker 未运行${NC}"
        echo ""
        return 0
    fi
    
    echo "找到Worker进程:"
    ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | \
        awk '{printf "  PID: %s, CPU: %s%%, Memory: %s%%\n", $2, $3, $4}'
    echo ""
    
    if [ "$FORCE" != "-f" ] && [ "$FORCE" != "--force" ]; then
        read -p "确认停止Worker? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ 取消操作"
            return 1
        fi
    fi
    
    echo "正在停止Worker..."
    WORKER_PIDS=$(ps aux | grep "start_rabbitmq_worker.py" | grep -v grep | awk '{print $2}')
    
    for pid in $WORKER_PIDS; do
        kill -15 $pid 2>/dev/null
    done
    
    sleep 2
    
    if check_status; then
        echo "尝试强制终止..."
        pkill -9 -f "start_rabbitmq_worker.py"
        sleep 1
    fi
    
    if ! check_status; then
        echo -e "${GREEN}✅ Worker 已停止${NC}"
        echo ""
    else
        echo -e "${RED}❌ 无法停止Worker，请手动检查${NC}"
        return 1
    fi
}

# 重启Worker
restart_worker() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    🔄 重启 Worker"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    stop_worker -f
    sleep 2
    start_worker
}

# 查看日志
show_logs() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    📋 Worker 日志"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    LATEST_LOG=$(ls -t "$SCRIPT_DIR/logs"/worker-*.log 2>/dev/null | head -1)
    
    if [ -z "$LATEST_LOG" ]; then
        echo "未找到日志文件"
        return 1
    fi
    
    echo "日志文件: $LATEST_LOG"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    tail -50 "$LATEST_LOG"
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "实时跟踪: tail -f $LATEST_LOG"
    echo "════════════════════════════════════════════════════════════════"
}

# 强制杀死Worker
kill_worker() {
    echo "════════════════════════════════════════════════════════════════"
    echo "    ☠️  强制终止 Worker"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    
    if ! check_status; then
        echo -e "${YELLOW}ℹ️  Worker 未运行${NC}"
        return 0
    fi
    
    echo -e "${RED}警告: 这将强制终止Worker进程（可能导致任务异常）${NC}"
    read -p "确认强制终止? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 取消操作"
        return 1
    fi
    
    echo "强制终止所有Worker进程..."
    pkill -9 -f "start_rabbitmq_worker.py"
    sleep 1
    
    if ! check_status; then
        echo -e "${GREEN}✅ 已强制终止${NC}"
    else
        echo -e "${RED}❌ 终止失败${NC}"
        return 1
    fi
}

# 主程序
main() {
    case "$1" in
        start)
            start_worker
            ;;
        stop)
            stop_worker "$2"
            ;;
        restart)
            restart_worker
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        kill)
            kill_worker
            ;;
        -h|--help|help)
            show_help
            ;;
        "")
            show_help
            ;;
        *)
            echo "未知命令: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 执行主程序
main "$@"

