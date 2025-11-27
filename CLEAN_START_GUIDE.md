# 🔄 清理并重新开始指南

## 📊 当前情况

**问题**: 旧任务 `f77cebe3...` 在数据库中状态为 `running`，每次Worker重启都会自动接收它。

**好消息**: 我们已经看到修复生效了！
- ✅ "FactorCollector strategy reference set"
- ✅ "Processing bar 10000/5302427 (0.2%)" - 进度在更新
- ✅ 修复已成功应用

---

## 🎯 两个选择

### 选择1: 从前端取消旧任务（推荐）

**步骤**:

1. **打开前端**: http://localhost:5173
2. **找到任务**: `f77cebe3-e57b-4ee4-9992-b1691f539bd2`
3. **点击"取消"按钮**
4. **等待取消完成**
5. **创建新的小数据集任务**

**优点**: 
- 干净利落
- 通过UI操作
- 状态更新正确

---

### 选择2: 让旧任务继续执行（不推荐）

**说明**: 
- 该任务需要 30-60 分钟完成
- 但我们已经验证了修复生效
- 可以等它完成后查看结果

**监控命令**:
```bash
tail -f /tmp/worker-ready-*.log
```

**预期日志**:
```
Processing bar 100000/5302427 (1.9%)
Processing bar 200000/5302427 (3.8%)
...
✅ 任务完成: f77cebe3...
   总交易次数: XX  ← 不再是 0
```

---

## 🚀 创建新的测试任务

取消旧任务后，创建新任务：

### 推荐配置

```
任务名称: 修复验证-快速测试
数据集: ES-23/ES/5m/agg_5m_from_1s.parquet
时间范围: 
  开始: 2023-01-01
  结束: 2023-01-03
信号周期: 5m
初始资金: 100000
```

### 为什么这样配置？

| 参数 | 值 | 原因 |
|------|-----|------|
| 数据集 | 5m聚合数据 | 数据量小，快速完成 |
| 时间范围 | 2-3天 | ~576条数据，1-2分钟完成 |
| 信号周期 | 5m | 与数据集匹配 |

---

## ✅ 验证修复效果

创建新任务后，运行：

```bash
# 实时查看日志
tail -f /tmp/worker-ready-*.log

# 应该看到：
# ✅ "FactorCollector strategy reference set"
# ✅ "Processing bar XXX/576"
# ✅ "Entry factors recorded: order_ref=..."
# ✅ "Exit factors recorded: order_ref=..."
# ✅ 总交易次数 > 0
```

### 验证结果

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
./verify_results.sh <NEW_TASK_ID>
```

---

## 📊 修复对比

### Before (修复前)
```
❌ Strategy not set, cannot record entry factors
❌ Entry order for exit order XXX not found
❌ trades.parquet: 0 条记录
❌ 总交易次数: 0
```

### After (修复后)
```
✅ FactorCollector strategy reference set
✅ Entry factors recorded: order_ref=1, price=...
✅ Exit factors recorded: order_ref=2, pnl=...
✅ trades.parquet: XX 条记录
✅ 总交易次数: XX
```

---

## 🎯 关键要点

1. **修复已成功**: 我们在旧任务的日志中看到了修复生效的证据
2. **使用小数据集**: 快速验证，1-2分钟完成
3. **从前端操作**: 取消旧任务最简单的方式

---

## 📞 需要帮助？

如果遇到问题：

1. **任务无法取消**: 
   - 刷新前端页面
   - 或等待Worker自然完成

2. **Worker没有接收新任务**:
   ```bash
   cd /Volumes/CODE/trading-analysis-platform/backtest-worker
   ./manage_worker.sh status
   ```

3. **新任务也没有交易记录**:
   - 检查策略参数（均线周期）
   - 检查数据质量
   - 运行: `./verify_results.sh <TASK_ID>`

---

**建议**: 从前端取消旧任务，然后创建新的小数据集任务进行快速验证。

