# K线图时区错位修复

**问题时间**: 2025-11-28  
**状态**: ✅ 已修复

---

## 🐛 问题描述

### 用户反馈
> 查看trade-5的K线时，图表渲染出来的K线位置和实际的入场出场K线位置不一致。

### 问题现象

用户查看交易的K线图时发现：
- 入场时间：2022-12-15T19:35:01
- API请求：`timestampSec=1671132901` (19:35:01)
- **但返回的K线时间**：从 `2022-12-16T03:35:00` 开始（第二天）
- **时间偏移**：+8小时！

---

## 🔍 问题根源

### DuckDB 时区转换问题

**问题代码** (`trading-data.service.ts`):
```sql
SELECT
  FLOOR(epoch(CAST(timestamp AS TIMESTAMP))) AS time,
  ...
FROM read_parquet([...])
WHERE CAST(timestamp AS TIMESTAMP) BETWEEN TIMESTAMP '...' AND TIMESTAMP '...'
```

**问题分析**:

聚合文件中 `timestamp` 列类型是 `TIMESTAMP WITH TIME ZONE`。

当使用 `CAST(timestamp AS TIMESTAMP)` 时，DuckDB 会应用**系统本地时区**进行转换：

```
原始值 (TIMESTAMPTZ): 2022-12-15T19:35:00.000Z
↓ CAST AS TIMESTAMP (应用 +8 时区)
转换后 (TIMESTAMP):    2022-12-16T03:35:00.000Z
```

**测试验证**:
```javascript
timestamp: "2022-12-15T19:35:00.000Z"  // 原始
ts_cast:   "2022-12-16T03:35:00.000Z"  // 转换后 (+8小时)
```

---

## ✅ 修复方案

### 使用 `AT TIME ZONE 'UTC'` 显式指定时区

**修复代码**:
```sql
SELECT
  FLOOR(epoch(timestamp AT TIME ZONE 'UTC')) AS time,  -- ✅ 显式UTC
  ...
FROM read_parquet([...])
WHERE timestamp AT TIME ZONE 'UTC' BETWEEN TIMESTAMP '...' AND TIMESTAMP '...'  -- ✅ 显式UTC
```

### 修复说明

1. **`AT TIME ZONE 'UTC'`** 显式将时间戳转换为UTC时区
2. **避免系统时区影响** - 无论服务器在哪个时区，都返回UTC时间
3. **保持时间一致性** - 数据存储、查询、显示全部使用UTC

---

## 📊 修复前后对比

### 修复前 ❌

**请求**:
```
timestampSec=1671132901  // 2022-12-15T19:35:01 UTC
```

**返回**:
```
第一根K线: 1671161700  // 2022-12-16T03:35:00 UTC (+8小时!)
```

**结果**:
- ❌ 时间完全不匹配
- ❌ 入场标记显示在错误的K线上
- ❌ 用户困惑

---

### 修复后 ✅

**请求**:
```
timestampSec=1671132901  // 2022-12-15T19:35:01 UTC
```

**返回**:
```
找到入场K线: 1671132900  // 2022-12-15T19:35:00 UTC ✅
价格范围: 3916.5 - 3927
入场价 3919.5 在范围内: ✅ 是
```

**结果**:
- ✅ 时间正确匹配
- ✅ 入场标记显示在正确的K线上
- ✅ 价格也在K线范围内

---

## 🧪 验证测试

### 测试 1: DuckDB 直接查询

```javascript
// 修复前
timestamp: "2022-12-15T19:35:00.000Z"
ts_cast:   "2022-12-16T03:35:00.000Z"  // ❌ +8小时

// 修复后
timestamp: "2022-12-15T19:35:00.000Z"
ts_utc:    "2022-12-15T19:35:00.000Z"  // ✅ 正确
```

### 测试 2: API 接口

```bash
curl '.../bars?timestampSec=1671132901&resolution=5m'

# 修复前
返回K线: 2022-12-16T03:35:00  # ❌ 第二天

# 修复后
返回K线: 2022-12-15T19:35:00  # ✅ 正确
入场价在范围内: ✅ 是
```

---

## 📝 修改的文件

| 文件 | 修改内容 | 行数 |
|-----|---------|------|
| `trading-data.service.ts` | 直接查询SQL - 添加 `AT TIME ZONE 'UTC'` | 2处 |
| `trading-data.service.ts` | 聚合查询SQL - 添加 `AT TIME ZONE 'UTC'` | 2处 |

**代码统计**:
- 修改SQL语句：2条
- 添加时区指定：4处

---

## 💡 相关问题

### 同类时区问题历史

1. **TIMESTAMP vs TIMESTAMPTZ 类型混合** (已修复)
   - 问题：DuckDB不允许混合类型比较
   - 修复：使用 `CAST(timestamp AS TIMESTAMP)`

2. **时区转换偏移** (本次修复)
   - 问题：CAST时应用了本地时区
   - 修复：使用 `AT TIME ZONE 'UTC'`

### 最佳实践

#### ✅ 推荐做法
```sql
-- 显式指定UTC时区
timestamp AT TIME ZONE 'UTC'
```

#### ❌ 避免做法
```sql
-- 依赖隐式转换（会应用系统时区）
CAST(timestamp AS TIMESTAMP)
```

---

## 🎯 技术细节

### DuckDB 时区处理

**类型说明**:
- `TIMESTAMP` - 不带时区的时间戳
- `TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ)` - 带时区的时间戳

**转换行为**:
```sql
-- 隐式转换（应用系统时区）
CAST(timestamptz_column AS TIMESTAMP)  -- ❌ 危险

-- 显式转换（指定时区）
timestamptz_column AT TIME ZONE 'UTC'  -- ✅ 安全
```

### 为什么是 +8 小时？

服务器可能运行在以下时区之一：
- 🇨🇳 **中国标准时间 (CST)** - UTC+8
- 🇸🇬 **新加坡时间 (SGT)** - UTC+8
- 🇦🇺 **澳大利亚西部时间 (AWST)** - UTC+8

Node.js/DuckDB 使用系统时区进行隐式转换。

---

## ✅ 完成检查清单

### 修复完成
- [x] 直接查询SQL添加时区指定
- [x] 聚合查询SQL添加时区指定
- [x] DuckDB测试通过
- [x] API测试通过
- [x] 时间匹配正确
- [x] 价格匹配正确

### 影响范围
- [x] K线图显示 - ✅ 修复
- [x] 交易标记位置 - ✅ 修复
- [x] 历史数据 - ✅ 无影响（查询逻辑修复）

---

## 🎉 修复总结

### 问题本质
- DuckDB 在类型转换时应用了系统本地时区
- 导致所有K线时间偏移 +8 小时

### 修复方案
- 使用 `AT TIME ZONE 'UTC'` 显式指定UTC时区
- 避免依赖系统时区的隐式转换

### 修复效果
- ✅ K线时间正确
- ✅ 交易标记准确
- ✅ 价格匹配验证通过

---

**✨ 修复完成！K线图现在显示正确的时间和位置了！✨**

用户现在可以准确地看到每笔交易的入场和出场K线位置！🎉


