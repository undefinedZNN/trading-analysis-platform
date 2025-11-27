# 🧪 快速测试指南 - 交易记录修复验证

## ✅ 修复已完成并应用

**修复时间**: 2025-11-26 01:23  
**Worker状态**: ✅ 已重启 (PID: 54214)  
**RabbitMQ队列**: ✅ 已清理  

---

## 🎯 关键修复

### 修复内容
1. ✅ 在 `RabbitMQStrategy.start()` 中添加 `factor_collector.set_strategy(self)`
2. ✅ 优化 `notify_order()` 中的参数调用
3. ✅ 添加更多日志输出

### 预期效果
- ✅ 不再出现 "Strategy not set" 警告
- ✅ 不再出现 "Entry order for exit order XXX not found" 警告
- ✅ trades.parquet 文件包含交易记录
- ✅ 总交易次数 > 0

---

## 📋 测试步骤

### 步骤1: 从前端创建测试任务

访问前端界面：`http://localhost:5173`

**推荐配置**：
```
任务名称: 修复验证测试
策略: 双均线策略
数据集: ES-23/ES/5m/agg_5m_from_1s.parquet（选择小范围）
时间范围: 2023-01-01 到 2023-01-03（2-3天即可）
信号周期: 5m
初始资金: 100000
```

**注意**: 选择小数据集可以快速验证（1-2分钟完成）

### 步骤2: 等待任务完成

观察前端任务状态：
- pending → running → completed

### 步骤3: 检查Worker日志

```bash
# 查看最新Worker日志
tail -100 /tmp/worker-fixed-*.log | grep -E "FactorCollector|Entry|Exit|任务完成"
```

**应该看到**：
```
[INFO] FactorCollector strategy reference set
[DEBUG] Entry factors recorded: order_ref=1, price=..., size=...
[DEBUG] Exit factors recorded: order_ref=2, pnl=..., pnl_percent=...
✅ 任务完成: <task_id>
   总交易次数: X  ← 不再是 0！
```

**不应该看到**：
```
[WARNING] Strategy not set, cannot record entry factors
[WARNING] Entry order for exit order XXX not found
```

### 步骤4: 验证Trades文件

```bash
# 替换 <TASK_ID> 为实际任务ID
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
./verify_results.sh <TASK_ID>
```

**预期输出**：
```
✅ Trades文件: trades_XXXXX.parquet
📦 文件大小: X,XXX bytes (不再是 598 bytes)
📊 交易记录数: XX (不再是 0)

【统计信息】
  总盈亏: XXX.XX
  盈利交易: XX
  亏损交易: XX
  平均盈亏: XX.XX
```

---

## 🔍 故障排查

### 如果交易数仍然为0

1. **检查策略条件**
   ```bash
   # 查看是否生成了交易信号
   tail -200 /tmp/worker-fixed-*.log | grep -E "Buy|Sell|order"
   ```

2. **检查数据质量**
   - 数据时间范围是否太短？
   - 数据是否包含足够的bars让均线计算？
   - 推荐至少选择3天以上的数据

3. **检查日志中的错误**
   ```bash
   tail -200 /tmp/worker-fixed-*.log | grep -i error
   ```

### 如果仍有警告

```bash
# 检查 set_strategy 是否被调用
grep "FactorCollector strategy reference set" /tmp/worker-fixed-*.log

# 如果没有找到，说明代码未更新，需要：
1. 确认代码修改已保存
2. 重启Worker
3. 清理RabbitMQ队列
```

---

## 📊 验证清单

- [ ] Worker已重启（最新日志时间戳）
- [ ] Worker日志显示 "FactorCollector strategy reference set"
- [ ] 任务完成时总交易次数 > 0
- [ ] trades.parquet 文件大小 > 1KB
- [ ] trades.parquet 包含交易记录
- [ ] 没有 "Strategy not set" 警告
- [ ] 没有 "Entry order not found" 警告
- [ ] 收益率合理（不是 -39.18%）

---

## 🚀 成功示例

**任务完成日志**：
```
2025-11-26 01:30:45 [INFO] __main__: ✅ 任务完成: abc123...
2025-11-26 01:30:45 [INFO] __main__:    总交易次数: 45
2025-11-26 01:30:45 [INFO] __main__:    总收益率: 3.21%
2025-11-26 01:30:45 [INFO] __main__:    处理Bar数: 8640
```

**Trades文件**：
```bash
$ python3 -c "import pandas as pd; df=pd.read_parquet('trades.parquet'); print(f'交易数: {len(df)}')"
交易数: 45
```

---

## 📞 需要帮助？

如果测试失败，请提供：
1. 任务ID
2. Worker日志（最后200行）
3. 错误截图

运行以下命令收集信息：
```bash
echo "任务ID: <TASK_ID>"
echo "Worker日志:"
tail -200 /tmp/worker-fixed-*.log
echo "Trades验证:"
./verify_results.sh <TASK_ID>
```

---

**准备就绪！** 🎉

现在您可以：
1. 打开前端：http://localhost:5173
2. 创建测试任务
3. 运行验证脚本

预计测试时间：**3-5分钟**

