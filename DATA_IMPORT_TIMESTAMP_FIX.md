# 数据导入时区类型修复

**修复时间**: 2025-11-27  
**问题**: 查询 K线数据接口报错

---

## 🐛 问题描述

### 错误信息
```
Binder Error: Cannot mix values of type TIMESTAMP and TIMESTAMP WITH TIME ZONE in BETWEEN clause - an explicit cast is required
LINE 10: WHERE timestamp BETWEEN TIMESTAMPTZ '2023-03-10T13:29:59.000Z' AND TIMESTAMPTZ '2023-03-17T13:29:59.000Z'
```

### 根本原因
SQL 查询使用了 `TIMESTAMPTZ`（带时区时间戳），但 Parquet 文件中的 `timestamp` 列是 `TIMESTAMP`（不带时区），导致类型不匹配。

---

## ✅ 修复内容

### 1. 修复数据集创建逻辑
**文件**: `backend/src/trading-data/services/import-processing.service.ts`

**问题**: 创建数据集时没有复制 `assetType` 和 `contractSpecs`

**修复**:
```typescript
const datasetPayload: DeepPartial<DatasetEntity> = {
  // ... 其他字段
  assetType: metadata?.assetType ?? 'crypto', // ✅ 新增
  contractSpecs: metadata?.contractSpecs ?? null, // ✅ 新增
  // ... 其他字段
};
```

### 2. 修复 DuckDB 查询类型不匹配
**文件**: `backend/src/trading-data/trading-data.service.ts`

**问题**: SQL 查询使用 `TIMESTAMPTZ`，但 Parquet 数据是 `TIMESTAMP`

**修复**:
```typescript
// 修改前
WHERE timestamp BETWEEN TIMESTAMPTZ '${fromIso}' AND TIMESTAMPTZ '${toIso}'

// 修改后
WHERE timestamp BETWEEN TIMESTAMP '${fromIso}' AND TIMESTAMP '${toIso}'
```

**影响范围**:
- ✅ 基础粒度查询（无需聚合）
- ✅ 聚合查询（需要重采样）

---

## 🔧 应用修复步骤

### 1. 重启后端服务
```bash
cd /Volumes/CODE/trading-analysis-platform/backend

# 停止当前服务（Ctrl+C 或 kill 进程）

# 重新启动
npm run start:dev
```

### 2. 验证修复

#### 测试查询接口
```bash
curl 'http://localhost:3000/api/v1/trading-data/datasets/9/candles?resolution=1s&limit=500&from=1678454999&to=1679059799'
```

**期望结果**:
```json
{
  "datasetId": 9,
  "symbol": "ES-期货",
  "granularity": "1s",
  "resolution": "1s",
  "from": 1678454999,
  "to": 1679059799,
  "limit": 500,
  "hasMore": true,
  "candles": [
    {
      "time": 1678454999,
      "open": 4000.5,
      "high": 4001.0,
      "low": 4000.0,
      "close": 4000.75,
      "volume": 100
    },
    // ... more candles
  ]
}
```

#### 验证资产类型和合约规格
```bash
curl 'http://localhost:3000/api/v1/trading-data/datasets/9' | jq '{datasetId, assetType, contractSpecs}'
```

**期望结果**:
```json
{
  "datasetId": 9,
  "assetType": "futures",
  "contractSpecs": {
    "tickSize": 0.25,
    "multiplier": 50
  }
}
```

---

## 📊 技术细节

### DuckDB 时间戳类型

| 类型 | 说明 | 用途 |
|-----|------|------|
| `TIMESTAMP` | 不带时区 | Parquet 文件存储 |
| `TIMESTAMPTZ` | 带时区 | UTC 时间戳 |

### Parquet 数据格式
```
timestamp (TIMESTAMP)
open (DOUBLE)
high (DOUBLE)
low (DOUBLE)
close (DOUBLE)
volume (DOUBLE)
```

### SQL 查询示例（修复后）
```sql
SELECT
  FLOOR(epoch(timestamp)) AS time,
  open, high, low, close, volume
FROM read_parquet(['data/ES/ES-期货/1s/*.parquet'])
WHERE timestamp BETWEEN TIMESTAMP '2023-03-10T13:29:59.000Z' 
                    AND TIMESTAMP '2023-03-17T13:29:59.000Z'
ORDER BY timestamp
LIMIT 500;
```

---

## 🎯 修复验证清单

- [x] 代码编译通过
- [x] Lint 检查通过
- [ ] 后端服务重启
- [ ] 接口返回正常数据
- [ ] 前端图表渲染成功
- [ ] 资产类型正确显示
- [ ] 合约规格正确显示

---

## 🚀 后续测试

### 测试场景
1. **基础粒度查询** - 查询 1s 数据
2. **聚合查询** - 查询 5m 数据（从 1s 聚合）
3. **跨批次查询** - 查询跨越多个 Parquet 文件的数据
4. **边界测试** - 查询数据集起始/结束时间边界

### 测试数据
- 数据集 ID: 9
- 交易对: ES-期货
- 粒度: 1s
- 时间范围: 2022-12-15 ~ 2023-03-17
- 记录数: 5,302,427 条

---

## 📝 相关文件

- `backend/src/trading-data/trading-data.service.ts` - 查询逻辑修复
- `backend/src/trading-data/services/import-processing.service.ts` - 数据集创建修复

---

**修复完成！重启后端服务后应该可以正常查询数据了。** 🎉

