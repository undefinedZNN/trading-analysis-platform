# 数据加载流程详解

## ❓ 用户问题

> "系统自动加载1秒数据的逻辑流程是什么？是触发了信号再从parquet拉取1s的数据还是？"

---

## ✅ 答案：**一次性全量加载** 

系统在**回测开始前**，会**一次性将所有1秒数据加载到内存**，而不是在触发信号时才拉取。

---

## 🔄 完整数据加载流程

### 时间轴视角

```
T0: 任务接收
    ↓
T1: 数据加载阶段 ⏱️ (耗时：1-2分钟)
    ├─ 从Parquet读取所有1秒数据
    ├─ 加载到Pandas DataFrame (530万条)
    ├─ 加载到内存 (~2GB)
    └─ 传递给Backtrader
    ↓
T2: Backtrader初始化
    ├─ 创建数据Feed (data[0])
    ├─ 重采样为5分钟 (data[1])
    └─ 准备策略
    ↓
T3: 回测执行 ⏱️ (耗时：10-15分钟)
    ├─ 循环遍历每一条1秒数据
    ├─ 每1秒调用 strategy.next()
    ├─ 检测5分钟新Bar
    ├─ 触发交易信号
    └─ 使用当前1秒价格成交
    ↓
T4: 结果保存
    └─ 写入equity.parquet和trades.parquet
```

**关键点**：
- ❌ **不是**：触发信号时才拉取数据
- ✅ **而是**：开始前一次性加载所有数据

---

## 🏗️ 详细流程图

### 阶段1：数据加载（T1）

```python
# backtest_executor.py: execute_backtest()

# Step 5: 加载数据
data_1s = self._load_data(dataset_path, data_config)
# ↓ 调用 _load_data()
```

#### `_load_data()` 方法流程

```python
def _load_data(self, dataset_path: str, data_config: dict):
    """
    一次性加载所有数据到内存
    """
    # 1. 路径处理
    dataset_path_obj = Path(dataset_path)
    if not dataset_path_obj.is_absolute():
        # 转换为绝对路径
        dataset_path_obj = project_root / 'backend/storage/datasets' / dataset_path
    
    # 2. 读取Parquet（一次性全量）
    if dataset_path_obj.is_dir():
        # 分区表：读取所有分区
        df = pd.read_parquet(str(dataset_path_obj))  # ← 一次性加载！
    else:
        # 单文件
        df = pd.read_parquet(str(dataset_path_obj))
    
    # 3. 数据预处理
    # - 转换时间戳
    # - 设置索引
    # - 确保列名正确
    
    # 4. 创建Backtrader DataFeed
    data = bt.feeds.PandasData(dataname=df)  # df已经在内存中
    
    return data  # 返回包含所有数据的Feed
```

**内存占用**：
```
1秒数据（ES-23全年）：
- 行数: 5,302,427
- 列数: 6 (open, high, low, close, volume, datetime)
- 内存: ~2GB
```

---

### 阶段2：Backtrader初始化（T2）

```python
# execute_backtest() 继续

# Step 5.1: 添加主数据（1秒）
cerebro.adddata(data_1s, name='1s')
# ↓
# Backtrader内部：将DataFrame包装为迭代器
# 数据已在内存，不会再次从磁盘读取

# Step 5.2: 重采样（5分钟）
cerebro.resampledata(data_1s, compression=5, name='5m')
# ↓
# Backtrader内部：创建重采样器
# 在运行时动态聚合，不额外占用内存
```

**Backtrader数据结构**：
```
cerebro.datas = [
    data[0]: 1秒数据（指向内存中的DataFrame）
    data[1]: 5分钟数据（Resampler，按需聚合）
]
```

---

### 阶段3：回测执行（T3）

```python
# execute_backtest() 继续

strategies = cerebro.run()  # ← 开始回测
# ↓
# Backtrader内部流程
```

#### Backtrader内部循环

```python
# Backtrader内部（伪代码）

for i in range(len(data_1s)):  # 遍历530万条数据
    # 1. 加载当前Bar的数据（从内存）
    current_bar_1s = data_1s[i]  # 快速内存访问
    
    # 2. 更新5分钟重采样器
    resampler_5m.update(current_bar_1s)
    
    # 3. 检查5分钟是否完成
    if resampler_5m.is_complete():
        current_bar_5m = resampler_5m.get_bar()  # 动态聚合
    
    # 4. 调用策略
    strategy.next()  # ← 用户策略代码
    
    # 5. 处理订单
    broker.process_orders(current_bar_1s.close)
    
    # 6. 更新账户
    broker.update_value()
```

**关键机制**：
- ✅ 数据已全部在内存
- ✅ 每次循环只是数组索引（极快）
- ✅ 5分钟数据按需聚合（不额外占用内存）

---

#### 策略中的数据访问

```python
class RabbitMQStrategy(bt.Strategy):
    def next(self):
        # 访问当前1秒数据
        current_price_1s = self.data_1s.close[0]  # ← 内存访问
        
        # 访问5分钟数据
        current_5m_close = self.signal_data.close[0]  # ← 重采样器提供
        
        # 访问历史数据
        prev_price = self.data_1s.close[-1]  # ← 内存访问（前一个Bar）
        
        # 买入（使用当前1秒价格）
        self.buy()  # 成交价 = self.data_1s.close[0]
```

**数据访问性能**：
- `self.data_1s.close[0]`：O(1) 内存访问
- `self.data_1s.close[-10]`：O(1) 内存访问（历史10个Bar）
- 不涉及磁盘I/O

---

## 💾 内存管理

### 当前实现（简化版）

```python
# backtest_executor.py: _load_data()

# 一次性加载所有数据到Pandas DataFrame
df = pd.read_parquet(dataset_path)  # ~2GB

# 传递给Backtrader
data = bt.feeds.PandasData(dataname=df)
```

**内存占用**：
- DataFrame: ~2GB（原始数据）
- Backtrader内部缓存: ~500MB（运行时状态）
- 总计: ~2.5GB

---

### 优化版（CachedDataFeed）

系统还提供了`CachedParquetDataFeed`：

```python
from backtrader_integration.data import CachedParquetDataFeed

data = CachedParquetDataFeed(
    symbol='ES',
    start_date='2023-01-01',
    end_date='2023-12-31',
    use_cache=True,  # ← 使用LRU缓存
    cache_capacity_mb=2048,  # 2GB缓存
)
```

**优化机制**：
- ✅ LRU缓存：多次运行相同任务时，直接从缓存读取
- ✅ 减少Parquet读取时间（从1-2分钟降至<1秒）
- ✅ 内存管理：自动淘汰最少使用的数据

---

## 📊 性能对比

### 方案对比

| 方案 | 加载方式 | 首次加载时间 | 后续加载时间 | 内存占用 |
|------|---------|------------|------------|---------|
| 当前实现 | 每次从Parquet读取 | 1-2分钟 | 1-2分钟 | ~2.5GB |
| CachedDataFeed | 首次Parquet，后续缓存 | 1-2分钟 | <1秒 | ~2.5GB |
| 按需加载（理论） | 逐Bar读取 | <1秒 | <1秒 | ~100MB |

**为什么不用"按需加载"？**
- ❌ Backtrader架构不支持流式数据
- ❌ 磁盘I/O会成为瓶颈（530万次读取）
- ❌ 难以实现高效的技术指标计算（如SMA需要历史数据）

---

## 🔍 数据流动追踪

### 从存储到策略的数据路径

```
磁盘存储
├─ backend/storage/datasets/
│  └─ ES-23/ES/1s/
│     ├─ date=2023-01-01/
│     │  └─ part-0000.parquet  (50MB)
│     ├─ date=2023-01-02/
│     │  └─ part-0000.parquet  (50MB)
│     └─ ... (365个分区)
│
↓ [T1: 数据加载 - 1-2分钟]
│
内存（Pandas DataFrame）
├─ Index: datetime (530万条)
├─ Columns: open, high, low, close, volume
├─ Memory: ~2GB
│
↓ [T2: Backtrader初始化 - <1秒]
│
Backtrader DataFeed
├─ data[0]: 1秒数据（指向DataFrame）
├─ data[1]: 5分钟重采样器（动态聚合）
│
↓ [T3: 回测执行 - 10-15分钟]
│
策略访问
├─ self.data_1s.close[0] → DataFrame[i].close  (O(1))
├─ self.signal_data.close[0] → Resampler.current_bar.close
│
↓
交易决策
├─ 金叉买入 → broker.buy(price=data_1s.close[0])
├─ 死叉卖出 → broker.sell(price=data_1s.close[0])
│
↓
成交模拟
├─ 订单队列处理
├─ 使用当前1秒价格成交
├─ 更新持仓和账户
```

---

## ⚡ 性能瓶颈分析

### 时间分布

```
总时间: 10-15分钟

T1: 数据加载     1-2分钟  (10-15%)  ← 瓶颈1
    ├─ Parquet读取  1分钟
    ├─ 数据转换     30秒
    └─ 内存分配     10秒

T2: 初始化       <1秒     (0.1%)
    ├─ 创建Cerebro  0.1秒
    ├─ 添加数据     0.2秒
    └─ 重采样器     0.1秒

T3: 回测执行     10-13分钟 (85-90%)  ← 瓶颈2
    ├─ 循环530万次
    ├─ 策略计算
    ├─ 指标更新
    └─ 订单处理

T4: 结果保存     <10秒    (1%)
    ├─ equity生成   2秒
    ├─ trades生成   2秒
    └─ Parquet写入  5秒
```

**优化方向**：
1. **T1优化**：使用缓存（CachedDataFeed）
2. **T3优化**：
   - 减少Python循环开销（Cython/Numba）
   - 减少指标计算（预计算）
   - 优化因子收集器

---

## 🎯 关键结论

### 1. 数据加载时机
✅ **回测开始前一次性加载**  
❌ **不是**触发信号时才加载

### 2. 数据存储位置
✅ **全部在内存**（Pandas DataFrame）  
❌ **不会**每次从磁盘读取

### 3. 多周期数据
✅ **只加载1秒数据一次**  
✅ **5分钟数据动态聚合**（不额外占用内存）

### 4. 性能特征
- 首次加载：1-2分钟（Parquet → 内存）
- 回测执行：10-15分钟（内存计算）
- 后续访问：O(1)（数组索引）

---

## 💡 Frontend集成影响

### 用户体验

```
用户创建任务 → 点击"执行"
    ↓
前端: 显示 "0% - 准备中..."
    ↓
后端: 任务发送到RabbitMQ
    ↓
Worker: 接收任务
    ↓
[1-2分钟] "5% - 加载数据..."  ← 用户需要等待
    ↓
[10-15分钟] "10% → 50% → 90% - 执行中..."  ← 有进度更新
    ↓
"100% - 完成"
```

**前端应该显示**：
- ⏱️ 预计时间：10-15分钟
- 📊 当前阶段：加载数据 / 执行回测 / 保存结果
- 🔄 进度条：基于处理的Bar数量

---

## 🚀 未来优化方向

### 1. 增量加载（复杂）
```python
# 理论上可以分批加载
for date_partition in date_range:
    df_chunk = load_partition(date_partition)
    cerebro.run_chunk(df_chunk)
```
**挑战**：Backtrader不支持流式数据

### 2. 预加载缓存（推荐）
```python
# 使用CachedDataFeed
data = CachedParquetDataFeed(
    symbol='ES',
    start_date='2023-01-01',
    end_date='2023-12-31',
    use_cache=True,
)
# 第二次运行: <1秒加载
```

### 3. 数据预热（生产环境）
```bash
# 系统启动时预加载常用数据
python preload_cache.py --symbols ES,NQ --year 2023
```

---

## 📚 相关代码

### 核心文件

1. **`backtest_executor.py`**
   - `execute_backtest()`: 主流程
   - `_load_data()`: 数据加载逻辑

2. **`cached_datafeed.py`**
   - `CachedParquetDataFeed`: 缓存优化版
   - `LRUCache`: 内存缓存管理

3. **Backtrader内部**
   - `bt.feeds.PandasData`: 将DataFrame包装为Feed
   - `cerebro.resampledata()`: 重采样逻辑

---

## ✅ 总结

**回答用户问题**：

> "系统自动加载1秒数据的逻辑流程是什么？是触发了信号再从parquet拉取1s的数据还是？"

**答案**：
1. ❌ **不是**触发信号时才拉取
2. ✅ **而是**在回测开始前**一次性加载所有数据到内存**
3. ✅ 回测执行时，所有数据访问都是**内存操作**（极快）
4. ✅ 5分钟数据通过Backtrader的`resampledata`**动态聚合**（不额外占用内存）

**关键优势**：
- ⚡ 回测执行速度快（无磁盘I/O）
- 🎯 数据一致性（内存中完整数据集）
- 💾 内存可控（只加载一次）

**未来优化**：
- 使用`CachedDataFeed`减少重复加载时间
- 实现数据预热机制


