#!/bin/bash

# 运行所有测试（包括增强边界和压力测试）

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     回测框架完整测试套件（包括增强边界和压力测试）              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/../../.."

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    local category=$3
    
    TOTAL_MODULES=$((TOTAL_MODULES + 1))
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}测试模块: $module_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    npx ts-node "$test_file" > /tmp/test_output.txt 2>&1
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ $module_name 测试通过${NC}"
        PASSED_MODULES=$((PASSED_MODULES + 1))
        TEST_RESULTS+=("✅ [$category] $module_name")
        # 显示关键指标
        cat /tmp/test_output.txt | grep -E "(性能:|总测试数|通过率|吞吐量)" | head -10
    else
        echo -e "${RED}❌ $module_name 测试失败${NC}"
        FAILED_MODULES=$((FAILED_MODULES + 1))
        TEST_RESULTS+=("❌ [$category] $module_name")
        # 显示错误信息
        cat /tmp/test_output.txt | tail -20
    fi
    
    echo ""
}

# ========================================
# M1 模块测试
# ========================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M1: 数据/特征与事件总线 - 单元测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/data/providers/test-runner.ts" ]; then
    run_test "src/backtesting/data/providers/test-runner.ts" "M1-01 DataProvider" "M1"
fi

if [ -f "src/backtesting/data/timeframe/test-runner.ts" ]; then
    run_test "src/backtesting/data/timeframe/test-runner.ts" "M1-02 TimeframeAdapter" "M1"
fi

if [ -f "src/backtesting/features/test-runner-extended.ts" ]; then
    run_test "src/backtesting/features/test-runner-extended.ts" "M1-03 FeatureRegistry" "M1"
fi

if [ -f "src/backtesting/events/enhanced-test-runner.ts" ]; then
    run_test "src/backtesting/events/enhanced-test-runner.ts" "M1-04-A EventBus 增强" "M1"
fi

if [ -f "src/backtesting/events/control-dead-letter-test.ts" ]; then
    run_test "src/backtesting/events/control-dead-letter-test.ts" "M1-04-B 控制流与死信" "M1"
fi

if [ -f "src/backtesting/events/integration-test.ts" ]; then
    run_test "src/backtesting/events/integration-test.ts" "M1-04-C 集成测试" "M1"
fi

# ========================================
# M2 模块测试
# ========================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  M2: 策略/风控/执行 - 单元测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/strategy/__tests__/simple-test.ts" ]; then
    run_test "src/backtesting/strategy/__tests__/simple-test.ts" "M2-01 StrategySandbox" "M2"
fi

if [ -f "src/backtesting/risk/__tests__/risk-engine.test.ts" ]; then
    run_test "src/backtesting/risk/__tests__/risk-engine.test.ts" "M2-02 RiskEngine" "M2"
fi

if [ -f "src/backtesting/execution/__tests__/execution-engine.test.ts" ]; then
    run_test "src/backtesting/execution/__tests__/execution-engine.test.ts" "M2-03 ExecutionEngine" "M2"
fi

if [ -f "src/backtesting/ledger/__tests__/ledger-service.test.ts" ]; then
    run_test "src/backtesting/ledger/__tests__/ledger-service.test.ts" "M2-04 LedgerService" "M2"
fi

# ========================================
# 增强边界和压力测试
# ========================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  增强边界和压力测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ -f "src/backtesting/__tests__/enhanced-boundary-stress-tests.ts" ]; then
    run_test "src/backtesting/__tests__/enhanced-boundary-stress-tests.ts" "增强边界和压力测试" "增强"
fi

# ========================================
# 打印总结
# ========================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   完整测试套件总结                              ║"
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
    
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                 🎉 所有测试通过！🎉                            ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
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

