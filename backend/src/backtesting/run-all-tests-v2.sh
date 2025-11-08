#!/bin/bash

# 回测框架全面回归测试脚本 v2
# 运行所有模块的单元测试

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          回测框架全面回归测试 v2                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/../../.."

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 统计变量
TOTAL_MODULES=0
PASSED_MODULES=0
FAILED_MODULES=0

# 测试结果数组
declare -a TEST_RESULTS

# 运行单个测试模块
run_test() {
    local test_file=$1
    local module_name=$2
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "测试模块: $module_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    TOTAL_MODULES=$((TOTAL_MODULES + 1))
    
    # 运行测试并捕获输出
    npx ts-node "$test_file" > /tmp/test_output.txt 2>&1
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ $module_name 测试通过${NC}"
        PASSED_MODULES=$((PASSED_MODULES + 1))
        TEST_RESULTS+=("✅ $module_name")
        # 显示测试统计
        cat /tmp/test_output.txt | grep -E "(总测试数|通过|失败|成功率)" | head -5
    else
        echo -e "${RED}❌ $module_name 测试失败${NC}"
        FAILED_MODULES=$((FAILED_MODULES + 1))
        TEST_RESULTS+=("❌ $module_name")
        # 显示错误信息
        cat /tmp/test_output.txt | tail -30
    fi
    
    echo ""
}

# M1 模块测试
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M1: 数据/特征与事件总线"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# M1-01 DataProvider
if [ -f "src/backtesting/data/providers/test-runner.ts" ]; then
    run_test "src/backtesting/data/providers/test-runner.ts" "M1-01 DataProvider"
fi

# M1-02 TimeframeAdapter  
if [ -f "src/backtesting/data/timeframe/test-runner.ts" ]; then
    run_test "src/backtesting/data/timeframe/test-runner.ts" "M1-02 TimeframeAdapter"
fi

# M1-03 FeatureRegistry
if [ -f "src/backtesting/features/test-runner-extended.ts" ]; then
    run_test "src/backtesting/features/test-runner-extended.ts" "M1-03 FeatureRegistry"
fi

# M1-04 EventBus - 基础测试
if [ -f "src/backtesting/events/test-runner.ts" ]; then
    run_test "src/backtesting/events/test-runner.ts" "M1-04-A EventBus 基础"
fi

# M1-04 EventBus - 增强测试
if [ -f "src/backtesting/events/enhanced-test-runner.ts" ]; then
    run_test "src/backtesting/events/enhanced-test-runner.ts" "M1-04-B EventBus 增强"
fi

# M1-04 EventBus - 控制流与死信
if [ -f "src/backtesting/events/control-dead-letter-test.ts" ]; then
    run_test "src/backtesting/events/control-dead-letter-test.ts" "M1-04-C 控制流与死信"
fi

# M1-04 EventBus - 重放
if [ -f "src/backtesting/events/replay-test.ts" ]; then
    run_test "src/backtesting/events/replay-test.ts" "M1-04-D 事件重放"
fi

# M1-04 EventBus - 集成测试
if [ -f "src/backtesting/events/integration-test.ts" ]; then
    run_test "src/backtesting/events/integration-test.ts" "M1-04-E 集成测试"
fi

# M2 模块测试
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M2: 策略/风控/执行"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# M2-01 StrategySandbox
if [ -f "src/backtesting/strategy/__tests__/simple-test.ts" ]; then
    run_test "src/backtesting/strategy/__tests__/simple-test.ts" "M2-01 StrategySandbox"
fi

# M2-02 RiskEngine
if [ -f "src/backtesting/risk/__tests__/risk-engine.test.ts" ]; then
    run_test "src/backtesting/risk/__tests__/risk-engine.test.ts" "M2-02 RiskEngine"
fi

# M2-03 ExecutionEngine
if [ -f "src/backtesting/execution/__tests__/execution-engine.test.ts" ]; then
    run_test "src/backtesting/execution/__tests__/execution-engine.test.ts" "M2-03 ExecutionEngine"
fi

# M2-04 LedgerService
if [ -f "src/backtesting/ledger/__tests__/ledger-service.test.ts" ]; then
    run_test "src/backtesting/ledger/__tests__/ledger-service.test.ts" "M2-04 LedgerService"
fi

# 边界和压力测试
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  边界和压力测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/tests/boundary-stress-tests.ts" ]; then
    run_test "src/backtesting/tests/boundary-stress-tests.ts" "EventBus 边界压力测试"
fi

if [ -f "src/backtesting/tests/data-modules-boundary-tests.ts" ]; then
    run_test "src/backtesting/tests/data-modules-boundary-tests.ts" "数据模块边界测试"
fi

# 打印总结
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   全面回归测试总结                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "模块测试结果:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for result in "${TEST_RESULTS[@]}"; do
    echo "  $result"
done
echo ""

echo "统计信息:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  总模块数: $TOTAL_MODULES"
echo "  通过模块: $PASSED_MODULES"
echo "  失败模块: $FAILED_MODULES"
echo ""

if [ $FAILED_MODULES -eq 0 ] && [ $TOTAL_MODULES -gt 0 ]; then
    success_rate=100
    echo -e "  ${GREEN}✅ 全部测试通过！成功率: ${success_rate}%${NC}"
    echo ""
    exit 0
elif [ $TOTAL_MODULES -eq 0 ]; then
    echo -e "  ${YELLOW}⚠️  没有找到测试文件${NC}"
    echo ""
    exit 1
else
    success_rate=$(awk "BEGIN {printf \"%.1f\", ($PASSED_MODULES/$TOTAL_MODULES)*100}")
    echo -e "  ${RED}❌ 有测试失败。成功率: ${success_rate}%${NC}"
    echo ""
    exit 1
fi

