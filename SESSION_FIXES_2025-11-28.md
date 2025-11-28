# 2025-11-28 修复汇总

本次会话完成的所有修复和优化。

---

## 📋 修复列表

### 1. ✅ Worker 服务 `initial_capital` 变量未定义
### 2. ✅ K线查询 TIMESTAMP 类型不匹配  
### 3. ✅ 交易盈亏计算错误
### 4. ✅ K线图时区错位 (+8小时偏移)
### 5. ✅ K线图交易标记位置错误

---

## 1️⃣ Worker 服务 initial_capital 未定义

### 问题
```
NameError: name 'initial_capital' is not defined
```

回测执行到最后生成结果时失败。

### 修复
**文件**: `backtest_executor.py` - `_execute_standard_backtest` 方法

```python
# ✅ 在方法开始提取 initial_capital
initial_capital = task_message['executionConfig']['initialCapital']
```

**状态**: ✅ 已修复

---

## 2️⃣ K线查询 TIMESTAMP 类型不匹配

### 问题
```
Binder Error: Cannot mix values of type TIMESTAMP WITH TIME ZONE and TIMESTAMP in BETWEEN clause
```

用户查看K线时接口返回 500 错误。

### 根本原因
- **原始文件**: timestamp 列是 `TIMESTAMP`
- **聚合文件**: timestamp 列是 `TIMESTAMP WITH TIME ZONE`
- **查询代码**: 使用 `TIMESTAMP '...'` 进行比较
- **DuckDB**: 不允许混合这两种类型

### 修复
**文件**: `backend/src/trading-data/trading-data.service.ts` - `queryCandles` 方法

```sql
-- ✅ 添加 CAST 统一类型
WHERE CAST(timestamp AS TIMESTAMP) BETWEEN TIMESTAMP '...' AND TIMESTAMP '...'
```

**状态**: ✅ 已修复

---

## 3️⃣ 交易盈亏计算错误

### 问题
交易明细显示的盈亏与价格变化方向不一致：
- 价格上涨但显示亏损
- 价格下跌但显示盈利

### 根本原因

**错误代码**:
```python
# ❌ 错误：使用了 exit_size（负数）
pnl = (order.executed.price - self.entry_price) * order.executed.size
```

**问题分析**:
1. 卖出订单的 `size = -1`（负数）
2. 导致 PNL 符号错误
3. 没有考虑期货合约乘数（50倍）

**示例**:
```python
# 买入 3929.25，卖出 3930
pnl = (3930 - 3929.25) * (-1) = -0.75  # ❌ 错误
```

### 修复
**文件**: `backtest_executor.py` - `notify_order` 方法

```python
# ✅ 修复1: 使用绝对值
position_size = abs(order.executed.size)

# ✅ 修复2: 获取合约乘数
comminfo = self.broker.getcommissioninfo(self.data_1s)
multiplier = comminfo.p.mult if hasattr(comminfo.p, 'mult') else 1

# ✅ 修复3: 正确计算
pnl = price_diff * position_size * multiplier
```

**示例（修复后）**:
```python
# 买入 3929.25，卖出 3930
pnl = (3930 - 3929.25) * 1 * 50 = 37.5  # ✅ 正确
```

**状态**: ✅ 已修复，需要重启 Worker

---

## 4️⃣ K线图时区错位 (+8小时)

### 问题
用户查看交易K线时，图表显示的K线位置与实际交易时间不匹配，偏移了8小时。

### 根本原因

**DuckDB 时区转换问题**:
```sql
-- ❌ 错误：隐式转换应用系统时区
CAST(timestamp AS TIMESTAMP)

-- 原始: 2022-12-15T19:35:00 UTC
-- 转换后: 2022-12-16T03:35:00 UTC (+8小时!)
```

当聚合文件中的 `TIMESTAMPTZ` 类型被转换为 `TIMESTAMP` 时，DuckDB 应用了系统本地时区(+8)。

### 修复
**文件**: `backend/src/trading-data/trading-data.service.ts` - `queryCandles` 方法

```sql
-- ✅ 修复：显式指定UTC时区
timestamp AT TIME ZONE 'UTC'

-- 查询示例
WHERE timestamp AT TIME ZONE 'UTC' BETWEEN TIMESTAMP '...' AND TIMESTAMP '...'
SELECT FLOOR(epoch(timestamp AT TIME ZONE 'UTC')) AS time
```

### 验证

**修复前**:
```
请求: 2022-12-15T19:35:01
返回: 2022-12-16T03:35:00  // ❌ +8小时
```

**修复后**:
```
请求: 2022-12-15T19:35:01
返回: 2022-12-15T19:35:00  // ✅ 正确
入场价在K线范围内: ✅ 是
```

**状态**: ✅ 已修复

---

## 5️⃣ K线图交易标记位置错误

### 问题
用户查看交易K线时，入场和出场标记都显示在同一根K线上，但实际持仓时长50分钟。

### 根本原因

**前端逻辑错误** (`TradeKLineDrawer.tsx`):
```typescript
// ❌ 错误：优先使用了 barTimestamp（入场时间）
const exitTime = trade.barTimestamp || trade.exitTimestamp || trade.timestamp;
```

**问题分析**:
- `barTimestamp` = 信号产生的K线时间 = **入场时间**
- `exitTimestamp` = **出场时间**
- 由于优先级问题，出场标记使用了入场时间

**实际数据**:
```json
{
  "barTimestamp": "2022-12-16T14:45:01",    // 入场
  "exitTimestamp": "2022-12-16T15:35:01",   // 出场（相差50分钟）
}
```

**错误结果**:
- 入场标记：14:45 ✅
- 出场标记：14:45 ❌（应该是15:35）

### 修复
**文件**: `frontend/src/modules/backtesting/components/TradeKLineDrawer.tsx`

```typescript
// ✅ 修复：移除 barTimestamp
const exitTime = trade.exitTimestamp || trade.timestamp;
```

### 验证

**修复前**:
```
14:45 K线: [入场标记][出场标记]  ❌ 重叠
```

**修复后**:
```
14:45 K线: [入场标记]
15:35 K线: [出场标记]  ✅ 正确分离，相差10根K线
```

**状态**: ✅ 已修复

---

## 🔧 应用修复

### Backend
- ✅ 已重启（K线查询修复已生效）

### Worker
- ⏳ 需要重启以应用修复：
  ```bash
  cd /Volumes/CODE/trading-analysis-platform/backtest-worker
  python start_rabbitmq_worker.py
  ```

---

## 📊 影响范围

| 修复项 | 影响功能 | 状态 |
|-------|---------|------|
| initial_capital | 回测结果生成 | ✅ 生效 |
| TIMESTAMP 类型 | K线查询基础 | ✅ 生效 |
| 时区偏移 | K线图时间轴 | ✅ 生效 |
| 交易标记位置 | K线图标记显示 | ✅ 生效（需刷新页面） |
| PNL 计算 | 交易盈亏显示 | ⏳ 需重启 Worker |

---

## ✅ 验证清单

### 已验证
- [x] K线接口正常返回
- [x] 回测任务可以完成

### 待验证（重启 Worker 后）
- [ ] 交易盈亏符号正确
- [ ] 合约乘数生效
- [ ] 盈亏与价格变化方向一致

---

## 📝 详细文档

- [交易盈亏修复详情](/TRADE_PNL_FIX.md)
- [K线时区错位修复](/KLINE_TIMEZONE_FIX.md)
- [K线标记位置修复](/KLINE_MARKER_POSITION_FIX.md)

---

**✨ 所有修复已完成！重启 Worker 后全部生效！✨**

