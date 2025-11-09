#!/bin/bash

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          🔍 回测框架结构验证                                    ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd /Volumes/work/zen/trading-analysis-platform/backend

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查M1模块（数据/特征与事件总线）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

modules_found=0
modules_total=0

# M1-01: DataProvider
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/data/providers/parquet-duckdb.provider.ts" ]; then
  echo "✅ M1-01: DataProvider"
  modules_found=$((modules_found + 1))
else
  echo "❌ M1-01: DataProvider"
fi

# M1-02: TimeframeAdapter  
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/data/timeframe/time-alignment.ts" ]; then
  echo "✅ M1-02: TimeframeAdapter"
  modules_found=$((modules_found + 1))
else
  echo "❌ M1-02: TimeframeAdapter"
fi

# M1-03: FeatureRegistry
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/features/registry.ts" ]; then
  echo "✅ M1-03: FeatureRegistry"
  modules_found=$((modules_found + 1))
else
  echo "❌ M1-03: FeatureRegistry"
fi

# M1-04: EventBus
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/events/bus.ts" ]; then
  echo "✅ M1-04: EventBus"
  modules_found=$((modules_found + 1))
else
  echo "❌ M1-04: EventBus"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查M2模块（策略/风控/执行）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# M2-01: StrategyEngine
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/strategy/strategy-engine.ts" ]; then
  echo "✅ M2-01: StrategyEngine"
  modules_found=$((modules_found + 1))
else
  echo "❌ M2-01: StrategyEngine"
fi

# M2-02: RiskEngine
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/risk/risk-engine.ts" ]; then
  echo "✅ M2-02: RiskEngine"
  modules_found=$((modules_found + 1))
else
  echo "❌ M2-02: RiskEngine"
fi

# M2-03: ExecutionEngine
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/execution/execution-engine.ts" ]; then
  echo "✅ M2-03: ExecutionEngine"
  modules_found=$((modules_found + 1))
else
  echo "❌ M2-03: ExecutionEngine"
fi

# M2-04: LedgerService
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/ledger/ledger-service.ts" ]; then
  echo "✅ M2-04: LedgerService"
  modules_found=$((modules_found + 1))
else
  echo "❌ M2-04: LedgerService"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查M3模块（编排与结果）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# M3-01: Orchestrator
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/orchestrator/orchestrator.ts" ]; then
  echo "✅ M3-01: Orchestrator"
  modules_found=$((modules_found + 1))
else
  echo "❌ M3-01: Orchestrator"
fi

# M3-02: Snapshot/Resume
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/orchestrator/snapshot/snapshot-coordinator.ts" ]; then
  echo "✅ M3-02: Snapshot/Resume"
  modules_found=$((modules_found + 1))
else
  echo "❌ M3-02: Snapshot/Resume"
fi

# M3-03: Analytics
modules_total=$((modules_total + 1))
if [ -f "src/backtesting/analytics/results-manager.ts" ]; then
  echo "✅ M3-03: Analytics"
  modules_found=$((modules_found + 1))
else
  echo "❌ M3-03: Analytics"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查M4模块（测试套件与CI）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# M4-01: E2E Tests
modules_total=$((modules_total + 1))
if [ -d "src/backtesting/e2e-tests" ]; then
  echo "✅ M4-01: E2E Tests"
  modules_found=$((modules_found + 1))
else
  echo "❌ M4-01: E2E Tests"
fi

# M4-02: CI
modules_total=$((modules_total + 1))
if [ -f "../../.github/workflows/e2e-tests.yml" ]; then
  echo "✅ M4-02: CI Integration"
  modules_found=$((modules_found + 1))
else
  echo "❌ M4-02: CI Integration"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查测试文件"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_files=$(find src/backtesting -name "*.spec.ts" | wc -l)
echo "📝 单元测试文件: $test_files 个"

e2e_files=$(find src/backtesting/e2e-tests/strategies -name "*.ts" 2>/dev/null | wc -l)
echo "📝 E2E测试策略: $e2e_files 个"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查文档"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

doc_files=$(find src/backtesting -name "*.md" | wc -l)
echo "📄 文档文件: $doc_files 个"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  统计"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "核心模块: $modules_found/$modules_total"
echo "完成率: $(echo "scale=1; $modules_found * 100 / $modules_total" | bc)%"
echo ""

if [ $modules_found -eq $modules_total ]; then
  echo "✅ 所有核心模块文件存在！"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  代码统计"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  total_lines=$(find src/backtesting -name "*.ts" -not -path "*/node_modules/*" -not -name "*.spec.ts" -not -name "*.e2e-spec.ts" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  test_lines=$(find src/backtesting -name "*.spec.ts" -o -name "*.e2e-spec.ts" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  
  echo "实现代码: ~$total_lines 行"
  echo "测试代码: ~$test_lines 行"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo "⚠️  部分核心模块文件缺失"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

