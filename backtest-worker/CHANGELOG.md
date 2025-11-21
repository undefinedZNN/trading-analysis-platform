# Backtest Worker - 更新日志

---

## [2.0.0] - 2025-11-21 - 迁移到 Backtrader

### 🎉 重大更新

**从自研引擎迁移到 Backtrader**

### ✅ 新增

- **Backtrader 集成模块** (`src/backtrader-integration/`)
  - ✅ 数据加载模块 (`data/cached_datafeed.py`) - LRU 缓存 + DuckDB + Parquet
  - ✅ 因子收集模块 (`factors/factor_collector.py`) - 入场/持仓/出场因子
  - ⏳ 策略执行模块 (`strategy/`) - 待开发
  - ⏳ 消息通信模块 (`messaging/`) - 待开发
  - ⏳ Checkpoint 模块 (`checkpoint/`) - 待开发
  - ⏳ 统计分析模块 (`analytics/`) - 待开发
  - ⏳ 工具模块 (`utils/`) - 待开发

- **文档**
  - 模块 README (`src/backtrader-integration/README.md`)
  - 清理报告 (`CLEANUP_REPORT.md`)
  - 更新日志 (`CHANGELOG.md`) - 本文件

### 🗑️ 删除

**旧的自研引擎代码（完全移除）**

- `src/backtesting/` - 旧回测引擎（~98 个文件）
- `src/controllers/` - 旧控制器
- `src/data/` - 旧数据处理
- `src/executor/` - 旧执行器
- `src/monitoring/` - 旧监控
- `src/registration/` - 旧注册逻辑
- `src/main.ts` - 旧入口文件
- `src/worker.module.ts` - 旧模块文件
- `test/` - 旧测试文件

**总计**: ~120+ 文件，~8,000+ 行代码

### 🔧 修改

- 无（全新架构）

### ⚠️ 破坏性变更

- **完全替换**: 旧的自研引擎代码已完全移除
- **语言变更**: TypeScript → Python (Backtrader)
- **架构变更**: 微服务架构不变，但实现方式改变
- **API 变更**: Worker 内部 API 完全重新设计

### 📚 迁移指南

#### 从旧引擎迁移到 Backtrader

1. **数据格式**: 无需变更，继续使用 Parquet 格式
2. **策略代码**: 需要重写为 Backtrader 策略格式
3. **配置文件**: 需要更新为新的配置格式
4. **测试**: 需要重新编写测试

详细迁移指南请参考: [POC 最终报告](../docs/architecture/backtrader-migration/POC_FINAL_REPORT.md)

---

## [1.0.0] - 2023-XX-XX - 自研引擎

### ✅ 功能

- 自研回测引擎
- TypeScript + NestJS 实现
- 支持多种策略
- 任务调度和管理
- 监控和日志

### 🗑️ 状态

**已废弃** - 于 2025-11-21 完全移除

---

## 版本说明

### 版本号规则

- **主版本号**: 重大架构变更
- **次版本号**: 新功能添加
- **修订号**: Bug 修复

### 当前版本

**2.0.0** - Backtrader 集成版本

---

## 相关文档

- [POC 最终报告](../docs/architecture/backtrader-migration/POC_FINAL_REPORT.md)
- [开发任务拆分](../docs/architecture/backtrader-migration/DEVELOPMENT_TASK_BREAKDOWN.md)
- [清理报告](./CLEANUP_REPORT.md)
- [模块 README](./src/backtrader-integration/README.md)

---

**维护团队**: Backend Team  
**最后更新**: 2025-11-21

