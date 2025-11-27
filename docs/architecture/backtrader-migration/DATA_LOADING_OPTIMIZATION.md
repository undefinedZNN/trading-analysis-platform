# 数据加载优化方案

## 🎯 问题陈述

### 当前实现的限制

1. **加载时间长** ⏰
   ```
   ES-23全年1秒数据：530万条
   加载时间：1-2分钟
   用户体验：需要等待
   ```

2. **内存压力大** 💾
   ```
   当前内存占用：~2.5GB (单品种单年)
   多品种场景：10品种 × 3年 = 75GB+
   风险：OOM (Out of Memory)
   ```

---

## 💡 解决方案

### 方案1：混合精度模式（推荐⭐）

#### 设计思路

提供两种回测模式，让用户根据需求选择：

```
┌─────────────────────────────────────────────┐
│ 精度模式选择                                 │
├─────────────────────────────────────────────┤
│ ○ 开发模式 (快速验证)                       │
│   • 使用预聚合数据（如5分钟K线）             │
│   • 加载时间：<1秒                          │
│   • 内存占用：~50MB                         │
│   • 精度：存在Bar内误差                     │
│   • 适用：策略逻辑验证、参数调优             │
│                                             │
│ ● 生产模式 (精确回测) [默认]                │
│   • 使用1秒数据+重采样                      │
│   • 加载时间：1-2分钟                       │
│   • 内存占用：~2.5GB                        │
│   • 精度：无Bar内误差                       │
│   • 适用：最终评估、实盘前验证               │
└─────────────────────────────────────────────┘
```

#### 数据存储结构

```
backend/storage/datasets/
├── ES-23/ES/
│   ├── 1s/                    ← 原始1秒数据（生产模式）
│   │   └── [Hive分区]
│   ├── 5m/                    ← 预聚合5分钟（开发模式）
│   │   └── agg_5m_from_1s.parquet
│   ├── 15m/                   ← 预聚合15分钟
│   │   └── agg_15m_from_1s.parquet
│   └── 1h/                    ← 预聚合1小时
│       └── agg_1h_from_1s.parquet
```

#### 实现代码

##### Backend DTO

```typescript
// backend/src/backtesting/tasks/dto/create-backtest-task.dto.ts

export class DataConfigDto {
  // ... 现有字段

  @ApiPropertyOptional({
    description: '精度模式：开发模式（快速）或生产模式（精确）',
    enum: ['development', 'production'],
    default: 'production',
  })
  @IsOptional()
  @IsIn(['development', 'production'])
  precisionMode?: 'development' | 'production' = 'production';
}
```

##### Worker逻辑

```python
# backtest_executor.py

def _load_data(self, dataset_path: str, data_config: dict):
    """根据精度模式加载不同数据"""
    
    precision_mode = data_config.get('precisionMode', 'production')
    strategy_timeframe = data_config.get('timeframe', '5m')
    
    if precision_mode == 'development':
        # 开发模式：直接使用预聚合数据
        logger.info(f"Development mode: loading pre-aggregated {strategy_timeframe} data")
        
        # 路径映射：5m → ES-23/ES/5m/agg_5m_from_1s.parquet
        aggregated_path = self._get_aggregated_path(dataset_path, strategy_timeframe)
        
        if os.path.exists(aggregated_path):
            df = pd.read_parquet(aggregated_path)
            logger.info(f"Loaded pre-aggregated data: {len(df)} bars in <1s")
            data = bt.feeds.PandasData(dataname=df)
            cerebro.adddata(data, name=strategy_timeframe)
            return data
        else:
            logger.warning(f"Pre-aggregated data not found: {aggregated_path}")
            logger.info("Falling back to production mode")
    
    # 生产模式：使用1秒数据
    logger.info(f"Production mode: loading 1s data and resampling to {strategy_timeframe}")
    
    # 现有的1秒数据加载逻辑
    data_1s = self._load_1s_data(dataset_path)
    cerebro.adddata(data_1s, name='1s')
    
    if strategy_timeframe != '1s':
        cerebro.resampledata(data_1s, timeframe=..., compression=..., name=strategy_timeframe)
    
    return data_1s

def _get_aggregated_path(self, base_path: str, timeframe: str) -> str:
    """获取预聚合数据路径"""
    # ES-23/ES/1s → ES-23/ES/5m/agg_5m_from_1s.parquet
    path_parts = Path(base_path).parts
    symbol_path = Path(*path_parts[:-1])  # ES-23/ES
    aggregated_path = symbol_path / timeframe / f'agg_{timeframe}_from_1s.parquet'
    return str(self.data_storage_base_path / aggregated_path)
```

##### Frontend UI

```tsx
// CreateBacktestTaskModal.tsx

{/* 精度模式选择 */}
<Form.Item
  name={['dataConfig', 'precisionMode']}
  label="精度模式"
  tooltip="开发模式快速验证策略逻辑，生产模式提供精确回测结果"
>
  <Radio.Group>
    <Space direction="vertical">
      <Radio value="development">
        <Space>
          <span>⚡ 开发模式（快速验证）</span>
          <Tag color="blue">推荐用于开发</Tag>
        </Space>
        <div style={{ color: '#999', fontSize: '12px', marginLeft: 24 }}>
          • 使用预聚合数据，加载时间<1秒<br/>
          • 存在Bar内成交误差<br/>
          • 适合快速迭代和参数调优
        </div>
      </Radio>
      
      <Radio value="production">
        <Space>
          <span>🎯 生产模式（精确回测）</span>
          <Tag color="green">推荐用于评估</Tag>
        </Space>
        <div style={{ color: '#999', fontSize: '12px', marginLeft: 24 }}>
          • 使用1秒数据，生产级精度<br/>
          • 无Bar内成交误差<br/>
          • 适合最终评估和实盘前验证
        </div>
      </Radio>
    </Space>
  </Radio.Group>
</Form.Item>

{/* 动态显示预期加载时间 */}
{precisionMode === 'development' && (
  <Alert
    message="开发模式：预计加载时间 <1秒"
    type="success"
    showIcon
  />
)}
{precisionMode === 'production' && (
  <Alert
    message="生产模式：预计加载时间 1-2分钟"
    type="warning"
    showIcon
  />
)}
```

#### 优势

✅ **灵活性**：用户根据需求选择  
✅ **易实现**：利用现有数据预处理  
✅ **兼容性**：不破坏现有架构  
✅ **用户教育**：明确说明精度差异

#### 劣势

❌ **存储成本**：需要存储多份数据（1s + 5m + 15m + 1h）  
❌ **数据同步**：需要保持预聚合数据更新

---

### 方案2：时间分段回测（解决内存问题⭐）

#### 设计思路

将长时间范围分成多个小段，分别回测后合并结果。

```
原始任务：2020-2023全年（3年）
    ↓ 分段
段1: 2020-01 → 2020-03 (3个月)
段2: 2020-04 → 2020-06
段3: 2020-07 → 2020-09
段4: 2020-10 → 2020-12
段5: 2021-01 → 2021-03
... (共12段)
    ↓ 每段独立回测
段1结果 + 段2结果 + ... + 段12结果
    ↓ 合并
最终完整结果
```

#### 内存对比

| 方案 | 单次内存占用 | 总内存峰值 |
|------|------------|----------|
| 一次性加载3年 | 7.5GB | 7.5GB |
| 分段(3个月) | 625MB | 625MB |
| **节省** | - | **92%** |

#### 实现代码

```python
# backtest_executor.py

def execute_backtest_segmented(self, task_message: dict):
    """分段回测执行"""
    
    task_id = task_message['taskId']
    time_range = task_message['dataConfig']['timeRange']
    
    # 1. 计算分段策略
    segments = self._calculate_segments(
        start=time_range['start'],
        end=time_range['end'],
        segment_size_months=3,  # 每段3个月
    )
    
    logger.info(f"Task {task_id} split into {len(segments)} segments")
    
    # 2. 逐段执行
    segment_results = []
    accumulated_capital = task_message['executionConfig']['initialCapital']
    
    for i, segment in enumerate(segments):
        logger.info(f"Processing segment {i+1}/{len(segments)}: {segment['start']} to {segment['end']}")
        
        # 2.1 加载当前段数据
        segment_data = self._load_data_for_segment(
            dataset_path=task_message['dataConfig']['datasetPath'],
            start=segment['start'],
            end=segment['end'],
        )
        
        # 2.2 执行回测
        segment_result = self._execute_segment(
            data=segment_data,
            initial_capital=accumulated_capital,
            config=task_message,
        )
        
        # 2.3 记录结果
        segment_results.append(segment_result)
        
        # 2.4 更新起始资金（连续回测）
        accumulated_capital = segment_result['final_capital']
        
        # 2.5 释放内存
        del segment_data
        gc.collect()
        
        # 2.6 发送进度
        progress = (i + 1) / len(segments) * 100
        self.rabbitmq_client.send_progress(
            task_id=task_id,
            progress=progress,
            message=f'Completed segment {i+1}/{len(segments)}',
        )
    
    # 3. 合并结果
    final_result = self._merge_segment_results(segment_results)
    
    return final_result

def _calculate_segments(self, start: str, end: str, segment_size_months: int):
    """计算时间分段"""
    segments = []
    current_start = pd.to_datetime(start)
    final_end = pd.to_datetime(end)
    
    while current_start < final_end:
        current_end = min(
            current_start + pd.DateOffset(months=segment_size_months),
            final_end
        )
        segments.append({
            'start': current_start.isoformat(),
            'end': current_end.isoformat(),
        })
        current_start = current_end
    
    return segments

def _load_data_for_segment(self, dataset_path: str, start: str, end: str):
    """加载指定时间范围的数据"""
    # 使用DuckDB查询特定时间范围
    import duckdb
    
    query = f"""
        SELECT * FROM read_parquet('{dataset_path}')
        WHERE timestamp >= '{start}'
          AND timestamp < '{end}'
        ORDER BY timestamp
    """
    
    df = duckdb.query(query).to_df()
    logger.info(f"Loaded segment data: {len(df)} bars")
    
    return df

def _merge_segment_results(self, segment_results: list):
    """合并分段结果"""
    # 合并equity曲线
    equity_curves = [seg['equity_curve'] for seg in segment_results]
    merged_equity = pd.concat(equity_curves, ignore_index=True)
    
    # 合并交易记录
    trades = [seg['trades'] for seg in segment_results]
    merged_trades = pd.concat(trades, ignore_index=True)
    
    # 计算总体统计
    final_result = {
        'final_capital': segment_results[-1]['final_capital'],
        'total_pnl': sum(seg['pnl'] for seg in segment_results),
        'total_trades': sum(seg['trade_count'] for seg in segment_results),
        'equity_curve': merged_equity,
        'trades': merged_trades,
        # ... 更多统计指标
    }
    
    return final_result
```

#### Frontend配置

```tsx
{/* 自动分段配置 */}
<Form.Item
  name={['dataConfig', 'enableSegmentation']}
  label="自动分段"
  tooltip="对于长时间范围的回测，自动分段可以显著降低内存占用"
>
  <Switch
    checkedChildren="开启"
    unCheckedChildren="关闭"
    defaultChecked={false}
  />
</Form.Item>

{enableSegmentation && (
  <Form.Item
    name={['dataConfig', 'segmentSizeMonths']}
    label="分段大小（月）"
  >
    <InputNumber min={1} max={12} defaultValue={3} />
  </Form.Item>
)}

{/* 自动建议 */}
{timeRangeDuration > 1 year && !enableSegmentation && (
  <Alert
    message="建议启用分段"
    description="您选择的时间范围较长，建议启用自动分段以降低内存占用。"
    type="warning"
    showIcon
  />
)}
```

#### 优势

✅ **内存可控**：单次只加载一小段数据  
✅ **适用长周期**：3年、5年甚至10年回测  
✅ **进度可视**：每段完成都有进度更新  
✅ **容错性强**：某段失败不影响其他段

#### 劣势

❌ **实现复杂**：需要处理段间连续性  
❌ **连续性问题**：持仓跨段、指标状态需要保持

---

### 方案3：增强型缓存（优化重复任务⭐）

#### 设计思路

使用系统现有的`CachedDataFeed`，但增强缓存策略。

```python
# cached_datafeed.py（增强版）

class EnhancedCachedDataFeed(CachedParquetDataFeed):
    """增强型缓存数据Feed"""
    
    def __init__(self, **kwargs):
        # 1. 检查缓存
        cache_key = self._generate_cache_key(kwargs)
        
        if cache_exists(cache_key):
            # 缓存命中：<1秒加载
            logger.info(f"Cache hit: {cache_key}")
            self.df = load_from_cache(cache_key)
        else:
            # 缓存未命中：1-2分钟加载
            logger.info(f"Cache miss: {cache_key}, loading from Parquet...")
            self.df = self._load_from_parquet(kwargs)
            
            # 保存到缓存
            save_to_cache(cache_key, self.df)
        
        super().__init__(dataname=self.df)
```

#### 缓存策略

```python
# 缓存配置
CACHE_CONFIG = {
    'capacity_mb': 10240,  # 10GB缓存
    'ttl_hours': 24,  # 24小时过期
    'max_entries': 50,  # 最多50个数据集
    'strategy': 'LRU',  # 最少使用淘汰
}

# 缓存键生成
cache_key = f"{symbol}_{start_date}_{end_date}_{timeframe}"
# 例如：ES_2023-01-01_2023-12-31_1s
```

#### 效果

| 执行次数 | 加载时间 |
|---------|---------|
| 第1次 | 1-2分钟（从Parquet） |
| 第2次 | <1秒（从缓存） |
| 第3次+ | <1秒（从缓存） |

#### 优势

✅ **后续快**：重复任务<1秒加载  
✅ **已实现**：利用现有`CachedDataFeed`  
✅ **透明**：对用户无感知

#### 劣势

❌ **首次慢**：第一次还是需要1-2分钟  
❌ **缓存管理**：需要定期清理

---

### 方案4：数据预热（生产环境优化）

#### 设计思路

在系统启动时或低峰期预加载常用数据集。

```python
# scripts/preload_cache.py

def preload_common_datasets():
    """预加载常用数据集到缓存"""
    
    common_datasets = [
        {'symbol': 'ES', 'year': 2023, 'timeframe': '1s'},
        {'symbol': 'ES', 'year': 2022, 'timeframe': '1s'},
        {'symbol': 'NQ', 'year': 2023, 'timeframe': '1s'},
        # ... 更多常用数据集
    ]
    
    for dataset in common_datasets:
        logger.info(f"Preloading {dataset['symbol']} {dataset['year']}...")
        
        # 加载到缓存
        CachedDataFeed(
            symbol=dataset['symbol'],
            start_date=f"{dataset['year']}-01-01",
            end_date=f"{dataset['year']}-12-31",
            use_cache=True,
        )
        
        logger.info(f"✅ {dataset['symbol']} {dataset['year']} cached")
```

#### 部署配置

```yaml
# docker-compose.yml

services:
  backtest-worker:
    # ...
    command: >
      sh -c "
        python scripts/preload_cache.py &&
        python start_rabbitmq_worker.py
      "
```

---

## 📊 方案对比总结

| 方案 | 首次加载 | 后续加载 | 内存占用 | 精度 | 实施难度 | 推荐度 |
|------|---------|---------|---------|------|---------|-------|
| **混合精度模式** | <1秒(dev) / 1-2分钟(prod) | 同左 | 50MB / 2.5GB | dev低/prod高 | ⭐ 低 | ⭐⭐⭐⭐⭐ |
| **时间分段** | 10-30秒/段 | 同左 | <1GB | 高 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐ |
| **增强缓存** | 1-2分钟 | <1秒 | 2.5GB | 高 | ⭐ 低 | ⭐⭐⭐⭐ |
| **数据预热** | <1秒 | <1秒 | 2.5GB | 高 | ⭐⭐ 低 | ⭐⭐⭐ |

---

## 🎯 推荐实施路径

### Phase 1：立即实施（1-2天）

**方案1：混合精度模式**

```
优先级：P0
工作量：1-2天
影响：立即改善用户体验
```

**实施步骤**：
1. Backend DTO添加`precisionMode`字段
2. Worker实现双模式加载逻辑
3. Frontend添加精度模式选择器
4. 准备预聚合数据（5m、15m、1h）

---

### Phase 2：短期优化（3-5天）

**方案3：增强缓存**

```
优先级：P1
工作量：2-3天
影响：重复任务提速
```

**实施步骤**：
1. 升级`CachedDataFeed`
2. 实现LRU缓存管理
3. 添加缓存统计API
4. Frontend显示缓存命中率

---

### Phase 3：中期优化（1-2周）

**方案2：时间分段**

```
优先级：P1
工作量：1-2周
影响：支持超长周期回测
```

**实施步骤**：
1. 实现分段算法
2. 处理段间连续性
3. 结果合并逻辑
4. Frontend配置UI

---

### Phase 4：长期优化（1个月）

**方案4：数据预热 + 流式加载**

```
优先级：P2
工作量：2-4周
影响：生产环境性能
```

---

## 📈 预期效果

### 实施后对比

| 场景 | 现在 | 实施后 |
|------|------|-------|
| **开发调试**（重复10次） | 10×2分钟=20分钟 | 10×1秒=10秒 |
| **单年回测** | 2分钟+15分钟=17分钟 | 1秒+15分钟=15分钟 |
| **3年回测** | OOM或7.5GB | 625MB×12段 |
| **用户满意度** | ⭐⭐ 等待焦虑 | ⭐⭐⭐⭐⭐ 流畅体验 |

---

## ✅ 总结

**立即可用的方案**：
1. ⭐⭐⭐⭐⭐ **混合精度模式**（最推荐）
2. ⭐⭐⭐⭐ **增强缓存**
3. ⭐⭐⭐⭐ **时间分段**

**建议**：
- 优先实施混合精度模式（快速见效）
- 同步准备预聚合数据
- 逐步优化缓存和分段功能

**是否需要我立即开始实施混合精度模式？** 🚀


