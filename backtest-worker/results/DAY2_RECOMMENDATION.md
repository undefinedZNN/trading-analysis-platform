# Day 2 行动建议

## 📋 Day 1总结

### ✅ 完成的工作
1. ✅ 运行完整测试（530万条数据）
2. ✅ 验证exactbars原理（10万条数据）
3. ✅ 发现关键问题和限制
4. ✅ 完成Day 1调研报告

### 🔍 核心发现

**Exactbars的真相：**
- ✅ 原理正确，技术可行（小数据集节省44.7%）
- ❌ 对大数据集效果有限（输入数据已占用2.5GB）
- 💡 需要配合流式加载或分段处理

---

## 🎯 Day 2决策点

### 我们面临的选择

```
选项A: 组合方案（快速）          选项B: 流式加载（完整）
     ⏱️ 1-2天                         ⏱️ 3-5天
     💾 降低85%                       💾 降低95%
     🔧 中等复杂度                    🔧 较高复杂度
     ✅ 立即可用                       ✅ 根本解决
```

---

## 🚀 推荐方案：选项A（组合方案）

### 为什么推荐组合方案？

| 维度 | 组合方案优势 |
|------|-------------|
| **快速见效** | 1-2天即可完成 |
| **风险可控** | 基于已验证的技术 |
| **效果显著** | 内存降低85%+ |
| **易于实现** | 代码量少，清晰 |
| **渐进式** | 可后续升级到流式 |

### 方案设计

#### 核心思想
```
大数据集（530万条）
    ↓ 分段
段1（100万条） + Exactbars → 内存400MB
段2（100万条） + Exactbars → 内存400MB
段3（100万条） + Exactbars → 内存400MB
...
    ↓ 合并结果
完整回测结果
```

#### 技术实现

```python
class SegmentedBacktester:
    """分段回测器（带Exactbars优化）"""
    
    def run_segmented(self, dataset_path, date_range, segment_months=1):
        """
        按月分段处理数据
        
        Args:
            dataset_path: 数据集路径
            date_range: (start_date, end_date)
            segment_months: 每段的月数（默认1个月）
        """
        
        # 生成段
        segments = self._create_segments(date_range, segment_months)
        
        results = []
        
        for i, segment in enumerate(segments):
            logger.info(f"Processing segment {i+1}/{len(segments)}")
            
            # 1. 加载段数据（带lookback）
            df = load_segment_with_lookback(
                dataset_path,
                start=segment['start'],
                end=segment['end'],
                lookback_days=60,  # 为指标预热
            )
            
            # 2. 创建Cerebro（使用Exactbars）
            cerebro = bt.Cerebro(
                exactbars=True,     # 在每段内优化
                preload=False,
                runonce=False,
            )
            
            # 3. 添加数据和策略
            data = bt.feeds.PandasData(dataname=df)
            cerebro.adddata(data)
            cerebro.addstrategy(MyStrategy)
            
            # 4. 设置初始资金（来自上一段）
            if i == 0:
                cerebro.broker.setcash(100000)
            else:
                cerebro.broker.setcash(results[-1]['final_value'])
            
            # 5. 运行回测
            result = cerebro.run()
            
            # 6. 保存结果
            results.append({
                'segment': i + 1,
                'start': segment['start'],
                'end': segment['end'],
                'final_value': cerebro.broker.getvalue(),
            })
            
            # 7. 释放内存
            del df, cerebro, data, result
            import gc
            gc.collect()
        
        # 8. 合并所有段的结果
        return self._merge_results(results)
```

#### 内存占用对比

```
方案对比（530万条数据）：

当前方案（纯加载）：
├─ 加载全部数据：2500 MB
├─ Backtrader内部：400 MB
└─ 总计：2900 MB

组合方案（分段+Exactbars）：
├─ 每段数据（100万）：470 MB
├─ Backtrader内部：80 MB（exactbars优化）
├─ 单段峰值：550 MB
└─ 总计：550 MB（降低81%）✅
```

---

## 📝 Day 2实施计划

### 上午（2-3小时）

#### 任务1：实现分段逻辑
```python
# 文件：segmented_backtester.py

def create_segments(start_date, end_date, segment_months=1):
    """生成时间段"""
    segments = []
    current = start_date
    
    while current < end_date:
        segment_end = current + relativedelta(months=segment_months)
        if segment_end > end_date:
            segment_end = end_date
        
        segments.append({
            'start': current,
            'end': segment_end,
            'lookback_start': current - timedelta(days=60),
        })
        
        current = segment_end
    
    return segments
```

#### 任务2：实现数据加载
```python
def load_segment_with_lookback(dataset_path, start, end, lookback_days):
    """加载段数据（带lookback）"""
    lookback_start = start - timedelta(days=lookback_days)
    
    conn = duckdb.connect()
    query = f"""
        SELECT * FROM read_parquet('{dataset_path}/**/*.parquet')
        WHERE timestamp >= '{lookback_start}'
          AND timestamp <= '{end}'
        ORDER BY timestamp
    """
    
    df = conn.execute(query).df()
    conn.close()
    
    # 标记lookback数据（用于指标预热，不计入交易）
    df['is_lookback'] = df['timestamp'] < start
    
    return df
```

### 下午（2-3小时）

#### 任务3：实现分段回测器
```python
# 完整实现SegmentedBacktester类
# 包括结果合并逻辑
```

#### 任务4：测试验证
```python
# 运行测试
backtester = SegmentedBacktester()
result = backtester.run_segmented(
    dataset_path='/path/to/data',
    date_range=(datetime(2022, 12, 15), datetime(2023, 3, 17)),
    segment_months=1,  # 每段1个月
)

# 验证：
# 1. 每段内存 < 600MB
# 2. 总时间可接受
# 3. 最终结果准确
```

---

## ✅ 成功标准

### Day 2必须达到

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 单段内存 | <600MB | 监控峰值内存 |
| 总内存降低 | >80% | 对比当前方案 |
| 结果准确性 | >95% | 与完整回测对比 |
| 实施完成 | 100% | 代码+测试通过 |

### 如果Day 2达标

→ **Day 3**：集成到Worker，添加API
→ **Day 4**：全面测试，性能调优
→ **Day 5**：文档完善，准备上线

---

## 🔄 备用方案：选项B（流式加载）

### 如果选择流式加载

**Day 2-3**：实现DuckDBStreamingFeed

```python
class DuckDBStreamingFeed(bt.DataBase):
    """真正的流式Feed"""
    
    params = (
        ('dataset_path', ''),
        ('chunk_size', 10000),
    )
    
    def __init__(self):
        super().__init__()
        self.conn = duckdb.connect()
        self.cursor = self.conn.execute(query)
        self.buffer = []
        self.buffer_index = 0
    
    def _load(self):
        """按需加载下一个bar"""
        if self.buffer_index >= len(self.buffer):
            # 获取下一个chunk
            self.buffer = self.cursor.fetchmany(self.p.chunk_size)
            if not self.buffer:
                return False
            self.buffer_index = 0
        
        row = self.buffer[self.buffer_index]
        self.buffer_index += 1
        
        # 设置OHLCV
        self.lines.datetime[0] = date2num(row['timestamp'])
        self.lines.open[0] = row['open']
        # ...
        
        return True
```

**预期效果：**
- 内存：~150MB（恒定，不随数据量增加）
- 时间：+30-40%
- 准确性：100%

**工作量：**3-5天

---

## 💡 最终建议

### 立即开始（今天/明天）

**✅ 推荐：实施组合方案**

**原因：**
1. 快速见效（1-2天）
2. 内存降低80%+
3. 风险可控
4. 易于实现
5. 可作为流式加载的过渡方案

**如果组合方案不够：**
- 后续可升级到流式加载
- 技术栈compatible
- 代码可复用

---

## 📊 预期时间表

```
Day 2（明天）：
├─ 上午：实现分段逻辑
├─ 下午：实现回测器
└─ 晚上：初步测试

Day 3：
├─ 上午：完善和调优
├─ 下午：全面测试
└─ 晚上：文档更新

Day 4：
├─ 集成到Worker
├─ 添加Backend API
└─ 端到端测试

Day 5：
├─ 性能调优
├─ 文档完善
└─ 准备上线
```

---

## 🎯 行动清单

### 今天完成
- [x] Day 1测试
- [x] 问题分析
- [x] 方案决策
- [x] Day 2计划

### 明天（Day 2）
- [ ] 实现分段逻辑
- [ ] 实现数据加载
- [ ] 实现分段回测器
- [ ] 运行测试验证
- [ ] 记录Day 2结果

---

## 📚 参考资料

1. **Day 1总结**：`results/day1_summary.md`
2. **实施计划**：`docs/architecture/MEMORY_OPTIMIZATION_PLAN.md`
3. **执行清单**：`docs/architecture/PHASE1_EXECUTION_CHECKLIST.md`

---

**报告生成时间**：2024-11-25 17:35

**下一步**：开始实施组合方案（分段+Exactbars）

**预期完成**：2-3天内完成实施和测试

