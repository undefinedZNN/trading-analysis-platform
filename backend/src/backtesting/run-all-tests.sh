#!/bin/bash

# 回测框架全面回归测试脚本
# 运行所有模块的单元测试

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          回测框架全面回归测试                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/../../.."

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 统计变量
TOTAL_MODULES=0
PASSED_MODULES=0
FAILED_MODULES=0
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

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
    output=$(npx ts-node "$test_file" 2>&1)
    exit_code=$?
    
    # 提取测试结果
    if echo "$output" | grep -q "总测试数:"; then
        local test_count=$(echo "$output" | grep "总测试数:" | sed 's/总测试数: //' | tr -d ' ')
        local passed=$(echo "$output" | grep "✅ 通过:" | sed 's/✅ 通过: //' | tr -d ' ')
        local failed=$(echo "$output" | grep "❌ 失败:" | sed 's/❌ 失败: //' | tr -d ' ')
        
        TOTAL_TESTS=$((TOTAL_TESTS + test_count))
        PASSED_TESTS=$((PASSED_TESTS + passed))
        FAILED_TESTS=$((FAILED_TESTS + failed))
    fi
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ $module_name 测试通过${NC}"
        PASSED_MODULES=$((PASSED_MODULES + 1))
        TEST_RESULTS+=("✅ $module_name")
    else
        echo -e "${RED}❌ $module_name 测试失败${NC}"
        FAILED_MODULES=$((FAILED_MODULES + 1))
        TEST_RESULTS+=("❌ $module_name")
        echo "$output" | tail -20
    fi
    
    echo ""
}

# M1 模块测试
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M1: 数据/特征与事件总线"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/data/providers/__tests__/data-provider.test.ts" ]; then
    run_test "src/backtesting/data/providers/__tests__/data-provider.test.ts" "M1-01 DataProvider"
fi

if [ -f "src/backtesting/data/timeframe/__tests__/timeframe-adapter.test.ts" ]; then
    run_test "src/backtesting/data/timeframe/__tests__/timeframe-adapter.test.ts" "M1-02 TimeframeAdapter"
fi

if [ -f "src/backtesting/features/__tests__/feature-registry.test.ts" ]; then
    run_test "src/backtesting/features/__tests__/feature-registry.test.ts" "M1-03 FeatureRegistry"
fi

if [ -f "src/backtesting/events/__tests__/event-bus.test.ts" ]; then
    run_test "src/backtesting/events/__tests__/event-bus.test.ts" "M1-04 EventBus"
fi

# M2 模块测试
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M2: 策略/风控/执行"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/strategy/__tests__/simple-test.ts" ]; then
    run_test "src/backtesting/strategy/__tests__/simple-test.ts" "M2-01 StrategySandbox"
fi

if [ -f "src/backtesting/risk/__tests__/risk-engine.test.ts" ]; then
    run_test "src/backtesting/risk/__tests__/risk-engine.test.ts" "M2-02 RiskEngine"
fi

if [ -f "src/backtesting/execution/__tests__/execution-engine.test.ts" ]; then
    run_test "src/backtesting/execution/__tests__/execution-engine.test.ts" "M2-03 ExecutionEngine"
fi

if [ -f "src/backtesting/ledger/__tests__/ledger-service.test.ts" ]; then
    run_test "src/backtesting/ledger/__tests__/ledger-service.test.ts" "M2-04 LedgerService"
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
echo "  总测试数: $TOTAL_TESTS"
echo "  通过测试: $PASSED_TESTS"
echo "  失败测试: $FAILED_TESTS"
echo ""

if [ $FAILED_MODULES -eq 0 ]; then
    success_rate=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
    echo -e "  ${GREEN}✅ 全部测试通过！成功率: ${success_rate}%${NC}"
    echo ""
    exit 0
else
    success_rate=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
    echo -e "  ${RED}❌ 有测试失败。成功率: ${success_rate}%${NC}"
    echo ""
    exit 1
fi

