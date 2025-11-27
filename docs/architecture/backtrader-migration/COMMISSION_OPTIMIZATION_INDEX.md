# 回测参数优化 - 文档索引

**创建时间**: 2025-11-27  
**状态**: 调研完成，待讨论

---

## 📚 文档导航

### 🎯 快速开始

如果您是第一次了解这个优化项目，建议按以下顺序阅读：

1. **⚡ [回测参数优化调研简报](../../../回测参数优化调研简报.md)** - 10分钟快速了解
   - 核心问题和解决方案
   - 实施计划时间表
   - 待讨论的关键问题

2. **📊 [系统对比图](./COMMISSION_COMPARISON.md)** - 可视化对比
   - 当前系统 vs 优化后系统流程图
   - 三种资产类型配置示例
   - 实际交易计算对比

3. **📖 [完整技术调研报告](./COMMISSION_ASSET_TYPE_RESEARCH.md)** - 深入技术细节
   - Backtrader佣金机制详解
   - 数据模型设计
   - Worker实现方案
   - 业界最佳实践

---

## 🗂 文档分类

### 背景与问题分析

#### 当前系统存在的问题
- ❌ 参数传递时信息丢失（Maker/Taker费率被简化）
- ❌ 没有资产类型区分（股票、期货、加密货币混为一谈）
- ❌ 缺少关键参数（合约乘数、保证金比例、Tick大小）
- ❌ 佣金模型单一（只支持百分比，不支持固定佣金）
- ❌ 计算不准确（期货盈亏计算错误）

**详见**: [调研简报 - 核心发现](../../../回测参数优化调研简报.md#核心发现)

---

### 技术方案

#### 1. 数据模型扩展

**数据库迁移**:
```sql
ALTER TABLE datasets ADD COLUMN asset_type TEXT DEFAULT 'crypto';
ALTER TABLE datasets ADD COLUMN contract_specs JSONB;
```

**详见**: [技术报告 - 数据模型设计](./COMMISSION_ASSET_TYPE_RESEARCH.md#数据模型设计)

#### 2. DTO 重构

新增类型：
- `AssetType`: stock | futures | crypto | forex
- `CommissionType`: percentage | fixed | maker-taker | tiered
- `CommissionConfigDto`: 统一的佣金配置
- `ContractSpecsDto`: 合约规格

**详见**: [技术报告 - ExecutionConfig扩展](./COMMISSION_ASSET_TYPE_RESEARCH.md#executionconfig-扩展)

#### 3. Worker 实现

核心类：
- `CommissionManager`: 统一的佣金管理器
- `_setup_stock_commission()`: 股票佣金配置
- `_setup_futures_commission()`: 期货佣金配置
- `_setup_crypto_commission()`: 加密货币佣金配置

**详见**: [技术报告 - Worker实现扩展](./COMMISSION_ASSET_TYPE_RESEARCH.md#worker-实现扩展)

---

### 实施计划

#### 时间表（14-19个工作日）

| Phase | 内容 | 工期 | 文档 |
|-------|-----|------|------|
| Phase 1 | 数据模型扩展 | 2-3天 | [技术报告 - Phase 1](./COMMISSION_ASSET_TYPE_RESEARCH.md#phase-1-数据模型扩展2-3天) |
| Phase 2 | DTO和API扩展 | 3-4天 | [技术报告 - Phase 2](./COMMISSION_ASSET_TYPE_RESEARCH.md#phase-2-dto-和-api-扩展3-4天) |
| Phase 3 | Worker实现 | 4-5天 | [技术报告 - Phase 3](./COMMISSION_ASSET_TYPE_RESEARCH.md#phase-3-worker-实现4-5天) |
| Phase 4 | 前端适配 | 3-4天 | [技术报告 - Phase 4](./COMMISSION_ASSET_TYPE_RESEARCH.md#phase-4-前端适配3-4天) |
| Phase 5 | 测试和文档 | 2-3天 | [技术报告 - Phase 5](./COMMISSION_ASSET_TYPE_RESEARCH.md#phase-5-集成测试和文档2-3天) |

**详细计划**: [调研简报 - 实施计划](../../../回测参数优化调研简报.md#实施计划)

---

### 配置示例

#### 中国A股
```typescript
{
  assetType: "stock",
  contractSpecs: {
    lotSize: 100,
    tickSize: 0.01,
    currency: "CNY"
  },
  commission: {
    type: "percentage",
    rate: 0.0003,
    minCommission: 5.0,
    stampDuty: 0.001
  }
}
```

#### 螺纹钢期货
```typescript
{
  assetType: "futures",
  contractSpecs: {
    multiplier: 10,
    tickSize: 1.0,
    marginRatio: 0.09,
    currency: "CNY"
  },
  commission: {
    type: "fixed",
    amount: 2.0
  }
}
```

#### 币安现货
```typescript
{
  assetType: "crypto",
  commission: {
    type: "maker-taker",
    makerRate: 0.001,
    takerRate: 0.001
  }
}
```

**更多示例**: [技术报告 - 附录A](./COMMISSION_ASSET_TYPE_RESEARCH.md#a-真实市场参数参考)

---

### 技术参考

#### Backtrader 佣金机制

核心参数说明：
```python
cerebro.broker.setcommission(
    commission=0.001,      # 佣金值
    mult=1.0,              # 合约乘数
    margin=None,           # 保证金
    commtype=COMM_PERC,    # 百分比或固定
    stocklike=True,        # 股票模式或期货模式
    percabs=True           # 百分比表示方式
)
```

**详见**: [技术报告 - Backtrader佣金机制](./COMMISSION_ASSET_TYPE_RESEARCH.md#backtrader佣金机制深度分析)

#### 股票 vs 期货差异

| 特性 | 股票 | 期货 |
|-----|------|------|
| `stocklike` | `True` | `False` |
| 价值计算 | size × price | size × price × mult |
| 现金管理 | 买入扣全款 | 占用保证金 |
| 每日结算 | 不结算 | 浮盈亏影响现金 |

**详见**: [系统对比 - 三种资产类型](./COMMISSION_COMPARISON.md#三种资产类型配置对比)

---

## 💬 待讨论问题

### 1. 资产类型优先级

**问题**: 应该先支持哪种资产类型？

**选项**:
- [ ] A. 先做期货（最复杂）
- [ ] B. 先做股票（用户熟悉）
- [ ] C. 先做加密货币（当前默认）

**讨论**: [调研简报 - 待讨论问题](../../../回测参数优化调研简报.md#待讨论问题)

### 2. 向后兼容程度

**问题**: 旧API如何处理？

**选项**:
- [ ] A. 完全兼容，自动转换
- [ ] B. 弃用警告，3个月后移除
- [ ] C. 破坏性更新

**讨论**: [调研简报 - 待讨论问题](../../../回测参数优化调研简报.md#待讨论问题)

### 3. Maker/Taker 处理

**问题**: Backtrader原生不支持，如何实现？

**选项**:
- [ ] A. 使用平均费率（简单）
- [ ] B. 自定义CommInfo（复杂但精确）
- [ ] C. 等待Backtrader更新

**讨论**: [调研简报 - 待讨论问题](../../../回测参数优化调研简报.md#待讨论问题)

---

## 📋 检查清单

### 开始开发前

- [ ] 确认资产类型优先级
- [ ] 确认向后兼容策略
- [ ] 确认必须实现的功能（P0）
- [ ] 分配开发资源
- [ ] 制定详细时间表

### Phase 1 完成标准

- [ ] 数据库迁移脚本通过
- [ ] Entity 更新完成
- [ ] 现有数据自动设置为 `crypto`
- [ ] 单元测试通过

### Phase 2 完成标准

- [ ] 新DTO类型定义完成
- [ ] 旧格式自动转换测试通过
- [ ] API文档更新
- [ ] Swagger UI 正确显示

### Phase 3 完成标准

- [ ] CommissionManager 实现完成
- [ ] 三种资产类型都能正确配置
- [ ] 单元测试覆盖率 > 80%
- [ ] 佣金计算验证正确

### Phase 4 完成标准

- [ ] 前端资产类型选择功能
- [ ] 动态表单根据类型显示
- [ ] 表单验证完整
- [ ] UI/UX 友好

### Phase 5 完成标准

- [ ] 端到端测试通过
- [ ] 性能测试无回归
- [ ] 用户文档完整
- [ ] 开发文档完整
- [ ] 示例策略可运行

---

## 🔗 相关代码位置

### 前端
- 创建任务: `frontend/src/modules/backtesting/components/CreateBacktestTaskModal.tsx`
- API适配器: `frontend/src/shared/api/backtestTasks.ts`

### 后端
- DTO定义: `backend/src/backtesting/tasks/dto/create-backtest-task.dto.ts`
- 任务分发: `backend/src/backtesting/tasks/rabbitmq-task-dispatcher.service.ts`
- RabbitMQ消息: `backend/src/backtesting/rabbitmq/rabbitmq-publisher.service.ts`
- 数据集Entity: `backend/src/trading-data/entities/dataset.entity.ts`

### Worker
- 执行器: `backtest-worker/src/backtrader_integration/execution/backtest_executor.py`
- （待创建）佣金管理器: `backtest-worker/src/backtrader_integration/commission/commission_manager.py`

### Backtrader
- 佣金基类: `backtrader/comminfo.py`
- 预定义类: `backtrader/commissions/__init__.py`
- Broker: `backtrader/brokers/bbroker.py`

---

## 📞 联系方式

如果您对调研报告有任何疑问或建议，请：

1. 在项目中创建Issue
2. 标记为 `enhancement` 和 `backtest-optimization`
3. 引用此文档索引

---

## 🚀 快速链接

### 主要文档
- 📄 [调研简报（中文）](../../../回测参数优化调研简报.md) - 快速了解
- 📄 [系统对比图](./COMMISSION_COMPARISON.md) - 可视化对比
- 📄 [技术调研报告（详细）](./COMMISSION_ASSET_TYPE_RESEARCH.md) - 技术细节

### 实施相关
- 📋 [实施计划](../../../回测参数优化调研简报.md#实施计划)
- ✅ [检查清单](#检查清单)
- 💬 [待讨论问题](#待讨论问题)

### 技术参考
- 🔧 [Backtrader佣金机制](./COMMISSION_ASSET_TYPE_RESEARCH.md#backtrader佣金机制深度分析)
- 📊 [配置示例](#配置示例)
- 💰 [佣金计算示例](./COMMISSION_COMPARISON.md#佣金计算示例对比)

---

**最后更新**: 2025-11-27  
**维护者**: AI Assistant  
**版本**: v1.0

