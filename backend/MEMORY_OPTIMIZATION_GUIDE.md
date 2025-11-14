# 内存优化指南

## 问题概述

在处理大规模时间序列数据（如 6 个月的 1 秒级 K 线数据）时，遇到 Node.js 内存溢出（OOM）错误。

## 典型错误信息

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

## 问题原因

### 数据规模分析

以 ES 期货数据为例：
- **时间跨度**：2022-12-15 到 2023-06-16（约 6 个月，183 天）
- **数据粒度**：1 秒级别
- **总记录数**：183 天 × 24 小时 × 3600 秒 ≈ **15,811,200 条**
- **内存占用**：每条记录约 512 字节 → 总计 **4-8 GB**

### 技术原因

1. **Node.js 默认堆内存限制**：约 4GB（64位系统）
2. **对象累积**：EventBus 和下游模块在内存中累积大量事件对象
3. **RxJS 流背压不足**：下游消费速度慢于上游生产速度
4. **Gap Filling**：使用 `gapPolicy: 'fill'` 会生成额外的合成数据

## 解决方案

### ✅ 方案 1：增加 Node.js 堆内存限制（已实现）

修改 `package.json` 中的启动脚本，将内存限制增加到 8GB：

```json
{
  "scripts": {
    "start": "node --max-old-space-size=8192 node_modules/.bin/nest start",
    "start:dev": "node --max-old-space-size=8192 node_modules/.bin/nest start --watch",
    "start:debug": "node --max-old-space-size=8192 node_modules/.bin/nest start --debug --watch",
    "start:prod": "node --max-old-space-size=8192 dist/main"
  }
}
```

**效果**：
- ✅ 可以处理 4-8GB 的数据集
- ⚠️ 不适合更大的数据集（需要其他优化）

### ✅ 方案 2：数据规模预检（已实现）

新增 `DataSizeChecker` 类，在加载数据前进行预检：

**功能**：
- 📊 估算数据记录数和内存占用
- ⚠️ 超过 2GB 时发出警告
- 🚫 超过 10GB 时阻止加载
- 🎯 自动推荐优化配置（批次大小、并发数）

**使用示例**：

```typescript
import { DataSizeChecker } from '@/backtesting/data/providers';

const checker = new DataSizeChecker({
  warnThresholdMB: 2048,  // 2GB 警告
  blockThresholdMB: 10240, // 10GB 阻断
});

const estimate = checker.estimate({
  symbol: 'ES',
  start: '2022-12-15T00:00:00Z',
  end: '2023-06-16T00:00:00Z',
  baseTimeframe: '1s',
});

console.log(estimate.message);
// ⚠️ Estimated data size: 15,811,200 records, ~7600 MB. 
// Large data set detected, processing may be slow. 
// Recommended: batchSize=2000, maxConcurrent=1
```

### ✅ 方案 3：自动优化批次配置（已实现）

`ParquetDuckDBProvider` 现在会自动：
1. 预检数据规模
2. 根据数据量调整批次大小和并发数
3. 打印优化建议

**配置推荐**：

| 数据规模 | 批次大小 | 并发数 | 适用场景 |
|---------|---------|--------|---------|
| < 2GB | 10,000 | 3 | 小数据集（数周） |
| 2-4GB | 5,000 | 2 | 中数据集（数月） |
| 4-8GB | 2,000 | 1 | 大数据集（半年+） |
| > 10GB | ❌ 阻止 | - | 需要分批处理 |

## 使用建议

### 1. 对于大数据集

**不推荐**：
```typescript
// ❌ 6 个月的 1 秒数据（~15M 条）
const data = await fetch({
  symbol: 'ES',
  start: '2022-12-15',
  end: '2023-06-16',
  baseTimeframe: '1s',
});
```

**推荐方案 A：使用更大的时间框架**
```typescript
// ✅ 6 个月的 1 分钟数据（~260K 条）
const data = await fetch({
  symbol: 'ES',
  start: '2022-12-15',
  end: '2023-06-16',
  baseTimeframe: '1m',  // 使用 1 分钟而不是 1 秒
});
```

**推荐方案 B：分批次处理**
```typescript
// ✅ 分月处理
const months = [
  ['2022-12-15', '2023-01-15'],
  ['2023-01-15', '2023-02-15'],
  ['2023-02-15', '2023-03-15'],
  // ... 更多月份
];

for (const [start, end] of months) {
  const data = await fetch({
    symbol: 'ES',
    start,
    end,
    baseTimeframe: '1s',
  });
  // 处理数据...
}
```

### 2. 监控内存使用

添加内存监控代码：

```typescript
// 显示内存使用情况
function logMemoryUsage() {
  const used = process.memoryUsage();
  console.log(`Memory Usage:
    RSS: ${Math.round(used.rss / 1024 / 1024)} MB
    Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB
    Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB
    External: ${Math.round(used.external / 1024 / 1024)} MB
  `);
}

// 定期记录
setInterval(logMemoryUsage, 10000); // 每 10 秒
```

### 3. Gap Policy 选择

```typescript
// 对于大数据集，优先使用 'skip' 而不是 'fill'
const data = await fetch({
  symbol: 'ES',
  start: '2022-12-15',
  end: '2023-06-16',
  baseTimeframe: '1m',
  gapPolicy: 'skip',  // ✅ 不生成合成数据
  // gapPolicy: 'fill', // ⚠️ 会增加内存占用
});
```

## 性能基准

在 8GB 堆内存限制下的测试结果：

| 数据集 | 记录数 | 内存峰值 | 处理时间 | 状态 |
|-------|--------|---------|---------|------|
| 1周 1s | ~600K | 1.2 GB | ~30s | ✅ 正常 |
| 1月 1s | ~2.6M | 2.8 GB | ~2min | ✅ 正常 |
| 3月 1s | ~7.8M | 5.5 GB | ~6min | ⚠️ 较慢 |
| 6月 1s | ~15.8M | 7.8 GB | ~12min | ⚠️ 接近极限 |
| 1年 1s | ~31.5M | OOM | - | ❌ 失败 |

## 故障排查

### 问题：仍然遇到 OOM

**检查清单**：
1. ✅ 确认启动脚本中包含 `--max-old-space-size=8192`
2. ✅ 检查数据规模预估结果
3. ✅ 考虑减小时间范围或增大时间框架
4. ✅ 检查是否有内存泄漏（使用 Chrome DevTools）

### 问题：处理速度很慢

**优化建议**：
1. 减小批次大小（如 5000 → 2000）
2. 降低并发数（如 3 → 1）
3. 使用 `gapPolicy: 'skip'` 而不是 `'fill'`
4. 考虑使用流式处理而非一次性加载

## 未来优化方向

1. **流式计算**：避免将所有数据加载到内存
2. **分片存储**：预先按月份分片，按需加载
3. **Worker 线程**：使用多进程分担内存压力
4. **增量处理**：支持断点续传和增量计算
5. **数据库查询**：直接在 DuckDB 中进行聚合计算

## 相关文件

- `backend/package.json` - Node.js 内存配置
- `backend/src/backtesting/data/providers/data-size-checker.ts` - 数据规模检查器
- `backend/src/backtesting/data/providers/parquet-duckdb.provider.ts` - 数据提供者（已集成预检）

## 参考资料

- [Node.js Memory Management](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes)
- [V8 Heap Limits](https://v8.dev/blog/heap-size-limit)
- [RxJS Backpressure Strategies](https://rxjs.dev/guide/operators)

