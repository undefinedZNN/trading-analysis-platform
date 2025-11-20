# 回测数据缓存设计方案

**版本**: v1.0  
**创建时间**: 2025-11-20  
**状态**: 需求调研阶段

---

## 📋 核心问题

1. **是否需要缓存**：Parquet 读取性能如何？是否需要缓存？
2. **缓存什么**：原始 OHLCV 数据？还是处理后的数据？
3. **缓存在哪**：内存？Redis？文件系统？
4. **缓存策略**：何时缓存？何时失效？
5. **多次回测复用**：同一标的、不同策略如何复用数据？

---

## 🎯 缓存场景分析

### 场景 1：单次回测

```
用户创建回测任务
  ↓
Worker 从 DuckDB 读取 Parquet 数据
  ↓
加载到 Backtrader DataFeed
  ↓
执行回测
  ↓
结束
```

**特点**：
- 数据只读取一次
- 无缓存需求

---

### 场景 2：参数优化（多次回测）

```
用户创建参数优化任务（50 组参数）
  ↓
Worker 循环执行 50 次回测
  ├─ 回测 1: 读取数据 → 执行 → 结束
  ├─ 回测 2: 读取数据 → 执行 → 结束  ⚠️ 重复读取
  ├─ 回测 3: 读取数据 → 执行 → 结束  ⚠️ 重复读取
  └─ ... (47 次重复读取)
```

**问题**：
- ❌ 每次都读取相同的 Parquet 数据
- ❌ I/O 开销巨大
- ❌ 性能浪费

**解决方案**：
- ✅ 第一次读取后缓存到内存
- ✅ 后续回测复用内存数据

---

### 场景 3：多用户并发回测（相同标的）

```
用户 A: 回测 AAPL（2020-2023）
用户 B: 回测 AAPL（2020-2023）同时进行
```

**问题**：
- ⚠️ 两个 Worker 同时读取相同数据
- ⚠️ 重复 I/O

**解决方案**：
- ✅ 共享缓存（Redis）
- ✅ 多个 Worker 共享数据

---

### 场景 4：历史数据很大（百万级K线）

```
用户回测 BTC（2015-2023，1分钟K线）
  ↓
数据量: 4,000,000+ 行
Parquet 文件大小: 200MB+
```

**问题**：
- ⚠️ 读取耗时长（几秒到十几秒）
- ⚠️ 内存占用大

**解决方案**：
- ✅ 数据预加载（Worker 启动时）
- ✅ 分片缓存（按时间范围）

---

## 📊 缓存方案对比

### 方案 A：无缓存（直接读取 Parquet）

**实现**：
```python
class ParquetDataFeed(bt.DataBase):
    def __init__(self, symbol, start_date, end_date):
        self.conn = duckdb.connect()
        self.data = None
    
    def start(self):
        # 每次回测时读取
        sql = f"""
        SELECT * FROM read_parquet('/data/market/{self.symbol}.parquet')
        WHERE datetime BETWEEN '{self.start_date}' AND '{self.end_date}'
        ORDER BY datetime
        """
        self.data = self.conn.execute(sql).fetchdf()
        self.idx = 0
    
    def _load(self):
        if self.idx >= len(self.data):
            return False
        
        row = self.data.iloc[self.idx]
        self.lines.datetime[0] = row['datetime']
        self.lines.open[0] = row['open']
        # ...
        self.idx += 1
        return True
```

**优点**：
- ✅ 实现简单
- ✅ 无内存压力

**缺点**：
- ❌ 每次回测都要读取数据
- ❌ 参数优化时性能很差
- ❌ I/O 瓶颈

**适用场景**：
- 单次回测
- 小数据量（< 10 万行）

---

### 方案 B：Worker 进程内存缓存 ⭐

**实现**：
```python
class CachedParquetDataFeed(bt.DataBase):
    # 类级别缓存（进程内共享）
    _cache = {}
    
    def __init__(self, symbol, start_date, end_date):
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date
        self.cache_key = f"{symbol}_{start_date}_{end_date}"
    
    def start(self):
        # 检查缓存
        if self.cache_key not in self._cache:
            # 第一次读取，缓存到内存
            conn = duckdb.connect()
            sql = f"""
            SELECT * FROM read_parquet('/data/market/{self.symbol}.parquet')
            WHERE datetime BETWEEN '{self.start_date}' AND '{self.end_date}'
            ORDER BY datetime
            """
            self._cache[self.cache_key] = conn.execute(sql).fetchdf()
            print(f"✅ Cached data for {self.cache_key}")
        else:
            print(f"🎯 Using cached data for {self.cache_key}")
        
        self.data = self._cache[self.cache_key]
        self.idx = 0
    
    def _load(self):
        if self.idx >= len(self.data):
            return False
        
        row = self.data.iloc[self.idx]
        self.lines.datetime[0] = row['datetime']
        self.lines.open[0] = row['open']
        # ...
        self.idx += 1
        return True
```

**缓存生命周期**：
```python
# Worker 进程启动
Worker starts
  ↓
处理任务 1（AAPL, 2020-2023）
  - 读取数据 → 缓存到 _cache
  ↓
处理任务 2（AAPL, 2020-2023，不同参数）
  - 命中缓存 ✅
  ↓
处理任务 3（AAPL, 2021-2023，不同时间范围）
  - 缓存未命中，读取新数据 → 缓存
  ↓
Worker 进程结束 → 缓存清空
```

**优点**：
- ✅ 同一 Worker 内多次回测复用数据
- ✅ 参数优化性能大幅提升（50 倍+）
- ✅ 实现简单
- ✅ 无需外部依赖

**缺点**：
- ⚠️ 内存占用较大
- ⚠️ 不同 Worker 间无法共享
- ⚠️ 缓存策略需要设计（避免 OOM）

**适用场景**：
- ✅ 参数优化（单 Worker 多次回测）
- ✅ 中小数据量（< 1GB）

---

### 方案 C：Redis 缓存（多 Worker 共享）

**实现**：
```python
import redis
import pickle

class RedisDataFeed(bt.DataBase):
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    
    def __init__(self, symbol, start_date, end_date):
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date
        self.cache_key = f"market_data:{symbol}:{start_date}:{end_date}"
    
    def start(self):
        # 检查 Redis 缓存
        cached_data = self.redis_client.get(self.cache_key)
        
        if cached_data:
            # 命中缓存
            self.data = pickle.loads(cached_data)
            print(f"🎯 Using Redis cached data for {self.cache_key}")
        else:
            # 缓存未命中，读取数据
            conn = duckdb.connect()
            sql = f"""
            SELECT * FROM read_parquet('/data/market/{self.symbol}.parquet')
            WHERE datetime BETWEEN '{self.start_date}' AND '{self.end_date}'
            ORDER BY datetime
            """
            self.data = conn.execute(sql).fetchdf()
            
            # 写入 Redis，设置过期时间（如 1 小时）
            self.redis_client.setex(
                self.cache_key,
                3600,  # 1 小时过期
                pickle.dumps(self.data)
            )
            print(f"✅ Cached data to Redis for {self.cache_key}")
        
        self.idx = 0
    
    def _load(self):
        if self.idx >= len(self.data):
            return False
        
        row = self.data.iloc[self.idx]
        self.lines.datetime[0] = row['datetime']
        self.lines.open[0] = row['open']
        # ...
        self.idx += 1
        return True
```

**优点**：
- ✅ 多个 Worker 共享缓存
- ✅ 并发场景性能更好
- ✅ 缓存持久化（重启 Worker 不丢失）
- ✅ 可以设置 TTL 自动过期

**缺点**：
- ⚠️ 需要额外的 Redis 服务
- ⚠️ 序列化/反序列化开销
- ⚠️ 网络 I/O 开销（Redis 连接）
- ⚠️ 数据量大时 Redis 内存压力

**适用场景**：
- 多 Worker 并发回测
- 需要跨进程共享数据
- 高并发场景

---

### 方案 D：混合缓存（L1 内存 + L2 Redis）

**实现**：
```python
class HybridCachedDataFeed(bt.DataBase):
    # L1 缓存：进程内存
    _l1_cache = {}
    # L2 缓存：Redis
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    
    def __init__(self, symbol, start_date, end_date):
        self.cache_key = f"{symbol}_{start_date}_{end_date}"
        self.redis_key = f"market_data:{symbol}:{start_date}:{end_date}"
    
    def start(self):
        # 1. 检查 L1 缓存（内存）
        if self.cache_key in self._l1_cache:
            self.data = self._l1_cache[self.cache_key]
            print(f"🎯 L1 cache hit: {self.cache_key}")
            return
        
        # 2. 检查 L2 缓存（Redis）
        cached_data = self.redis_client.get(self.redis_key)
        if cached_data:
            self.data = pickle.loads(cached_data)
            # 写入 L1 缓存
            self._l1_cache[self.cache_key] = self.data
            print(f"🎯 L2 cache hit: {self.cache_key}")
            return
        
        # 3. 缓存未命中，读取数据
        conn = duckdb.connect()
        sql = f"SELECT * FROM read_parquet('/data/market/{self.symbol}.parquet') ..."
        self.data = conn.execute(sql).fetchdf()
        
        # 写入 L1 和 L2 缓存
        self._l1_cache[self.cache_key] = self.data
        self.redis_client.setex(self.redis_key, 3600, pickle.dumps(self.data))
        print(f"✅ Data cached to L1 and L2: {self.cache_key}")
        
        self.idx = 0
```

**优点**：
- ✅ 兼顾性能和共享
- ✅ L1 缓存极快（内存）
- ✅ L2 缓存共享（Redis）

**缺点**：
- ⚠️ 实现复杂
- ⚠️ 需要管理两层缓存

---

### 方案 E：预加载 + 分片缓存

**适用场景**：数据量特别大（百万级K线）

**实现**：
```python
class ShardedDataFeed(bt.DataBase):
    # 按月份分片缓存
    _cache = {}
    
    def __init__(self, symbol, start_date, end_date):
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date
    
    def start(self):
        # 计算需要的月份分片
        shards = self._get_required_shards(self.start_date, self.end_date)
        
        # 加载所有分片
        all_data = []
        for shard in shards:
            cache_key = f"{self.symbol}_{shard}"
            if cache_key not in self._cache:
                # 读取该月份的数据
                sql = f"""
                SELECT * FROM read_parquet('/data/market/{self.symbol}/{shard}.parquet')
                """
                self._cache[cache_key] = conn.execute(sql).fetchdf()
            
            all_data.append(self._cache[cache_key])
        
        # 合并所有分片并筛选时间范围
        self.data = pd.concat(all_data)
        self.data = self.data[
            (self.data['datetime'] >= self.start_date) &
            (self.data['datetime'] <= self.end_date)
        ]
        self.idx = 0
    
    def _get_required_shards(self, start_date, end_date):
        # 返回需要的月份列表：['2023-01', '2023-02', ...]
        shards = []
        current = start_date
        while current <= end_date:
            shards.append(current.strftime('%Y-%m'))
            current += relativedelta(months=1)
        return shards
```

**优点**：
- ✅ 内存可控（只缓存需要的分片）
- ✅ 复用率高（不同时间范围可能重叠）

**缺点**：
- ⚠️ 数据文件需要按分片存储
- ⚠️ 实现复杂

---

## 🎯 推荐方案

### POC 阶段：方案 A（无缓存）

**理由**：
- ✅ 实现简单
- ✅ POC 数据量小，性能可接受

---

### 正式开发（MVP）：方案 B（Worker 内存缓存） ⭐⭐⭐

**理由**：
- ✅ 实现简单，无外部依赖
- ✅ 覆盖主要场景（参数优化）
- ✅ 性能提升明显（50 倍+）
- ✅ 内存可控（LRU 淘汰策略）

**实现细节**：

```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity_mb=1024):  # 默认 1GB
        self.capacity_mb = capacity_mb
        self.cache = OrderedDict()
        self.current_size_mb = 0
    
    def get(self, key):
        if key not in self.cache:
            return None
        # 移到末尾（最近使用）
        self.cache.move_to_end(key)
        return self.cache[key]
    
    def put(self, key, value):
        # 计算数据大小
        size_mb = value.memory_usage(deep=True).sum() / (1024 ** 2)
        
        # 如果已存在，先删除
        if key in self.cache:
            old_size = self.cache[key]['size_mb']
            self.current_size_mb -= old_size
            del self.cache[key]
        
        # 检查容量，需要时淘汰旧数据
        while self.current_size_mb + size_mb > self.capacity_mb and self.cache:
            oldest_key, oldest_value = self.cache.popitem(last=False)
            self.current_size_mb -= oldest_value['size_mb']
            print(f"⚠️ Evicted {oldest_key} from cache")
        
        # 写入缓存
        self.cache[key] = {
            'data': value,
            'size_mb': size_mb
        }
        self.current_size_mb += size_mb
        self.cache.move_to_end(key)
        print(f"✅ Cached {key} ({size_mb:.2f} MB), total: {self.current_size_mb:.2f} MB")

# 全局缓存实例
data_cache = LRUCache(capacity_mb=1024)

class CachedParquetDataFeed(bt.DataBase):
    def start(self):
        cache_key = f"{self.symbol}_{self.start_date}_{self.end_date}"
        
        # 从缓存获取
        cached_data = data_cache.get(cache_key)
        if cached_data is not None:
            self.data = cached_data
            print(f"🎯 Cache hit: {cache_key}")
        else:
            # 读取数据
            self.data = self._load_from_parquet()
            # 写入缓存
            data_cache.put(cache_key, self.data)
        
        self.idx = 0
```

---

### 高级功能（可选）：方案 C 或 D

**场景**：
- 多 Worker 并发
- 高频回测

**渐进式升级**：
- 第一阶段：方案 B（Worker 内存缓存）
- 第二阶段：如果有需求，升级到方案 D（混合缓存）

---

## 📊 性能对比估算

### 测试场景：参数优化（50 组参数）

**数据量**：100 万行 K线数据（约 50MB Parquet 文件）

| 方案 | 第1次回测 | 第2-50次回测 | 总耗时 | 性能提升 |
|------|----------|-------------|--------|---------|
| 方案 A（无缓存） | 3s | 3s | 150s | 基准 |
| 方案 B（内存缓存） | 3s | 0.05s | ~5.5s | **27倍** ⚡ |
| 方案 C（Redis缓存） | 3s | 0.5s | ~27.5s | **5.5倍** |
| 方案 D（混合缓存） | 3s | 0.05s (L1) / 0.5s (L2) | ~8s | **18倍** |

**结论**：
- ✅ 方案 B 性能提升最明显
- ✅ 对于参数优化场景，内存缓存已足够

---

## ⚙️ 缓存配置

### 配置项

```yaml
# backtest-worker 配置
cache:
  enabled: true
  type: memory  # memory / redis / hybrid
  
  # 内存缓存配置
  memory:
    capacity_mb: 2048  # 最大 2GB
    eviction_policy: lru  # LRU 淘汰策略
  
  # Redis 缓存配置
  redis:
    host: localhost
    port: 6379
    db: 0
    ttl: 3600  # 1 小时过期
    max_memory_mb: 4096  # Redis 最大内存
```

### 监控指标

```python
# 缓存监控
cache_metrics = {
    "hit_rate": 0.85,        # 命中率 85%
    "miss_rate": 0.15,       # 未命中率 15%
    "total_hits": 425,       # 总命中次数
    "total_misses": 75,      # 总未命中次数
    "current_size_mb": 850,  # 当前缓存大小
    "evictions": 12,         # 淘汰次数
}

# 通过 Worker 心跳上报
```

---

## ❓ 待确认的问题

### 1. 是否需要缓存？

**问题**：POC 阶段性能测试后，是否需要缓存？

**选项**：
- **A. POC 先不缓存，正式开发再加** ⭐
  - 先验证 Parquet 直接读取的性能
  - 如果可接受，暂不缓存
  
- **B. POC 阶段就加缓存**
  - 直接验证最终方案的性能

**你的选择**：[ ]

---

### 2. 缓存容量限制

**问题**：内存缓存的容量上限设为多少？

**选项**：
- **A. 1GB** - 保守
- **B. 2GB** - 适中 ⭐
- **C. 4GB** - 激进
- **D. 动态**（根据可用内存）

**你的选择**：[ ]

---

### 3. 缓存预热

**问题**：是否需要预热（Worker 启动时预加载常用数据）？

**选项**：
- **A. 不需要**：按需加载 ⭐
- **B. 需要**：预加载热门标的数据

**你的选择**：[ ]

---

### 4. 缓存失效策略

**问题**：何时清除缓存？

**选项**（可多选）：
- [ ] LRU 淘汰（内存不足时）
- [ ] TTL 过期（固定时间后）
- [ ] 手动清除（管理后台）
- [ ] Worker 重启时清空

**你的选择**：[ ]

---

### 5. 是否需要 Redis 缓存？

**问题**：是否需要在 MVP 阶段就实现 Redis 缓存？

**选项**：
- **A. 不需要**：先用内存缓存，后续根据需求升级 ⭐
- **B. 需要**：直接实现 Redis 缓存

**你的选择**：[ ]

---

## 📚 相关文档

- [Backtrader 最终方案](./backtrader-final-solution.md)
- [Worker 通信设计](./worker-communication-design.md)
- [可视化系统设计](./visualization-system-design.md)

---

**下一步**：确认上述问题后，我会创建详细的缓存实现代码。

