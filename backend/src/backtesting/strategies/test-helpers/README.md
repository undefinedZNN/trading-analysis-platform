# OHLCV 数据生成器

## 📝 概述

`OHLCVGenerator` 是一个用于生成连贯的模拟市场数据的工具，主要用于策略回测和测试。

## ✨ 特性

- ✅ **连贯性保证**：后一条记录的开盘价 = 前一条记录的收盘价
- ✅ **涨跌幅限制**：防止价格无限增长或跌至负数
- ✅ **多种趋势支持**：上涨、下跌、震荡
- ✅ **数据完整性**：确保 High ≥ Open/Close，Low ≤ Open/Close
- ✅ **成交量模拟**：成交量与价格波动相关

## 🚀 使用方法

### 基本用法

```typescript
import { OHLCVGenerator } from './test-helpers/ohlcv-generator';

// 创建生成器
// 参数: 初始价格, 波动率, 最大涨跌幅
const generator = new OHLCVGenerator(100, 0.02, 1.0);

// 生成震荡市场数据
const data = generator.generateData(100);

// 生成趋势数据
const uptrendData = generator.generateTrendingData(100, 'up');
const downtrendData = generator.generateTrendingData(100, 'down');
const sidewaysData = generator.generateTrendingData(100, 'sideways');
```

## 📐 参数说明

### 构造函数参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `initialPrice` | number | 100 | 初始价格 |
| `volatility` | number | 0.02 | 波动率（0.02 = 2%） |
| `maxChangePercent` | number | 2.0 | 最大涨跌幅（2.0 = 200%） |

### 涨跌幅限制详解

**涨跌幅限制** 控制价格在初始价格基础上的最大变动幅度：

```typescript
// 示例1: 初始价格100，涨跌幅100%
const generator = new OHLCVGenerator(100, 0.02, 1.0);
// 价格范围: 0 - 200

// 示例2: 初始价格100，涨跌幅50%
const generator = new OHLCVGenerator(100, 0.02, 0.5);
// 价格范围: 50 - 150

// 示例3: 初始价格100，涨跌幅200%（默认）
const generator = new OHLCVGenerator(100, 0.02, 2.0);
// 价格范围: 0 - 300（下限不低于0）
```

**计算公式**:
- 价格下限 = `max(0, initialPrice * (1 - maxChangePercent))`
- 价格上限 = `initialPrice * (1 + maxChangePercent)`

### 趋势类型

| 趋势 | 说明 | 每条记录变化 |
|------|------|------------|
| `'up'` | 上涨趋势 | +0.1% |
| `'down'` | 下跌趋势 | -0.1% |
| `'sideways'` | 震荡市场 | 随机波动 |

## 📊 使用示例

### 示例1: 生成短期测试数据

```typescript
const generator = new OHLCVGenerator(50000, 0.02, 1.0);
const data = generator.generateTrendingData(100, 'up');

console.log(`生成 ${data.length} 条记录`);
console.log(`价格范围: ${Math.min(...data.map(d => d.close))} - ${Math.max(...data.map(d => d.close))}`);
```

### 示例2: 生成长期回测数据

```typescript
// 生成20000条数据用于完整回测
const generator = new OHLCVGenerator(50000, 0.02, 1.0);
const data = generator.generateTrendingData(20000, 'sideways');

// 价格将被限制在 0 - 100000 之间
```

### 示例3: 获取价格范围信息

```typescript
const generator = new OHLCVGenerator(100, 0.02, 1.0);
const range = generator.getPriceRange();

console.log(`初始价格: ${range.initialPrice}`);
console.log(`最大涨跌幅: ${range.maxChangePercent * 100}%`);
console.log(`价格下限: ${range.minPrice}`);
console.log(`价格上限: ${range.maxPrice}`);
```

### 示例4: 重置生成器

```typescript
const generator = new OHLCVGenerator(100, 0.02, 1.0);

// 生成第一批数据
const data1 = generator.generateTrendingData(100, 'up');

// 重置状态
generator.reset();

// 生成第二批数据（从初始价格重新开始）
const data2 = generator.generateTrendingData(100, 'down');
```

## 🔍 API 文档

### `generateRecord(): OHLCVRecord`

生成单条OHLCV记录。

**返回**: 包含 `open`, `high`, `low`, `close`, `volume` 的对象

### `generateData(count?: number): OHLCVRecord[]`

生成指定数量的OHLCV记录（震荡市场）。

**参数**:
- `count`: 记录数量，默认 100

**返回**: OHLCV记录数组

### `generateTrendingData(count?: number, trendDirection?: 'up' | 'down' | 'sideways'): OHLCVRecord[]`

生成带趋势的OHLCV记录。

**参数**:
- `count`: 记录数量，默认 100
- `trendDirection`: 趋势方向，默认 'up'

**返回**: OHLCV记录数组

### `getPriceRange(): object`

获取价格范围信息。

**返回**:
```typescript
{
  minPrice: number;      // 最低价格
  maxPrice: number;      // 最高价格
  initialPrice: number;  // 初始价格
  maxChangePercent: number; // 最大涨跌幅
}
```

### `reset(): void`

重置生成器状态（价格回到初始值）。

### `getState(): object`

获取生成器当前状态。

**返回**:
```typescript
{
  currentPrice: number;
  lastRecord: OHLCVRecord | null;
  priceRange: {
    minPrice: number;
    maxPrice: number;
    initialPrice: number;
  };
}
```

## 🧪 测试

运行涨跌幅限制测试：

```bash
npx ts-node src/backtesting/strategies/test-helpers/test-price-limit.ts
```

**测试内容**:
- ✅ 默认涨跌幅限制（200%）
- ✅ 自定义涨跌幅限制（100%, 50%）
- ✅ 下跌趋势价格不低于0
- ✅ OHLCV数据完整性验证

## 📈 测试结果

### 涨跌幅限制效果对比

#### 修改前（无限制）
```
初始价格: 50000
生成 20000 条数据（上涨趋势）
价格范围: 50000 - 49480634551285  ❌ 价格无限增长
```

#### 修改后（100%限制）
```
初始价格: 50000
涨跌幅限制: 100%
生成 20000 条数据（上涨趋势）
价格范围: 43073 - 100000  ✅ 价格被正确限制
```

## ⚙️ 配置建议

### 短期测试（100-1000条）
```typescript
const generator = new OHLCVGenerator(100, 0.02, 1.0);
```

### 中期回测（1000-10000条）
```typescript
const generator = new OHLCVGenerator(50000, 0.02, 1.0);
```

### 长期回测（10000+条）
```typescript
const generator = new OHLCVGenerator(50000, 0.01, 0.5);
// 降低波动率和涨跌幅，使数据更稳定
```

## 🎯 注意事项

1. **波动率设置**
   - 过高（>5%）：价格快速触及上下限
   - 过低（<1%）：价格变化不明显
   - 推荐：1-3%

2. **涨跌幅设置**
   - 过高（>300%）：接近无限制
   - 过低（<20%）：价格很快触及边界
   - 推荐：50-200%

3. **数据量设置**
   - 策略测试：100-1000条
   - 完整回测：10000-50000条
   - 避免过多（>100000条）：生成耗时较长

4. **趋势持续性**
   - 上涨/下跌趋势会持续到触及边界
   - 触及边界后价格会在边界附近震荡
   - 适合测试策略在极端行情下的表现

## 📚 相关文档

- [策略测试套件](../test-strategies.ts)
- [信号可视化工具](../visualize-signals.ts)
- [策略使用文档](../README.md)

---

**最后更新**: 2025-11-12  
**版本**: 2.0.0

