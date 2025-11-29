# 动态策略加载功能 - 测试指南

> **版本**: v1.0  
> **创建日期**: 2025-11-29  
> **状态**: 准备测试

---

## 📋 测试前准备

### 1. 确认代码更新

已更新的文件：
- ✅ `backtest-worker/src/backtrader_integration/dynamic_strategy_loader.py` (新文件)
- ✅ `backtest-worker/src/backtrader_integration/execution/backtest_executor.py` (已修改)
- ✅ `backtest-worker/tests/test_dynamic_strategy_loader.py` (新文件)

### 2. 运行单元测试

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
/Volumes/CODE/trading-analysis-platform/backtest-worker/venv/bin/python -m pytest tests/test_dynamic_strategy_loader.py -v
```

**预期结果**:
```
16 passed in 0.29s
```

---

## 🚀 启动服务

### 1. 启动 Backend

```bash
cd /Volumes/CODE/trading-analysis-platform/backend
npm run start:dev
```

### 2. 启动 Worker

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
source venv/bin/activate
python start_rabbitmq_worker.py
```

**检查日志**，应该看到：
```
DynamicStrategyLoader initialized: cache=True, cache_size=100, security_check=True, timeout=5s
BacktestExecutor initialized: worker_id=..., strategy_loader enabled
```

### 3. 启动 Frontend

```bash
cd /Volumes/CODE/trading-analysis-platform/frontend
npm run dev
```

---

## 🧪 端到端测试

### 测试场景 1：使用已有策略（ThreeLineTrendAtrStrategy）

#### 步骤

1. **打开前端** → 回测管理 → 创建回测任务

2. **选择策略**
   - 策略：ThreeLineTrendAtrStrategy (已上传的策略)
   - 脚本版本：选择 master 版本

3. **配置参数**
   - 数据集：选择已有的期货数据集
   - 初始资金：100000
   - 其他参数保持默认

4. **创建任务**

5. **查看 Worker 日志**，应该看到：
   ```
   Loading user strategy: <strategy_id>
   User strategy loaded: ThreeLineTrendAtrStrategy
   ```

6. **等待回测完成**

7. **查看结果**
   - 交易明细应该包含做空交易（direction='short'）
   - 所有交易数据应该正确显示

#### 预期结果

- ✅ 任务创建成功
- ✅ Worker 动态加载策略成功
- ✅ 回测执行成功
- ✅ 交易明细包含做多和做空交易
- ✅ PNL 计算正确

---

### 测试场景 2：创建新策略

#### 步骤

1. **创建简单测试策略**

前端 → 策略管理 → 创建策略

**策略代码**:
```python
"""
简单测试策略 - 固定周期买入卖出
"""
import backtrader as bt
from typing import Dict, Any


class SimpleTestStrategy(bt.Strategy):
    """
    简单测试策略
    
    每 5 根 K 线买入，再过 5 根 K 线卖出
    """
    
    params = (
        ('buy_interval', 5),
        ('hold_period', 5),
    )
    
    def __init__(self):
        self.bar_count = 0
        self.position_bar = 0
    
    def next(self):
        self.bar_count += 1
        
        if not self.position:
            # 每 buy_interval 根 K 线买入
            if self.bar_count % self.p.buy_interval == 0:
                size = int(self.broker.getcash() * 0.95 / self.data.close[0])
                if size > 0:
                    self.buy(size=size)
                    self.position_bar = self.bar_count
                    self.log(f'BUY CREATE, price={self.data.close[0]:.2f}, size={size}')
        else:
            # 持仓 hold_period 根 K 线后卖出
            if self.bar_count - self.position_bar >= self.p.hold_period:
                self.sell(size=abs(self.position.size))
                self.log(f'SELL CREATE, price={self.data.close[0]:.2f}')
    
    def log(self, txt):
        """日志"""
        print(f'[Strategy] {txt}')


# 导出策略类
Strategy = SimpleTestStrategy
```

2. **创建回测任务**
   - 使用新创建的策略
   - 选择数据集
   - 配置参数：`buy_interval=5`, `hold_period=5`

3. **查看 Worker 日志**
   ```
   Loading user strategy: <new_strategy_id>
   User strategy loaded: SimpleTestStrategy
   ```

4. **查看回测结果**

#### 预期结果

- ✅ 策略创建成功
- ✅ 代码验证通过
- ✅ Worker 加载策略成功
- ✅ 回测执行成功
- ✅ 交易按照策略逻辑执行

---

### 测试场景 3：错误代码测试

#### 步骤 1：语法错误

```python
import backtrader as bt

class BadStrategy(bt.Strategy):
    def next(self):
        pass
    # 缺少右括号

Strategy = BadStrategy
```

**预期结果**:
- ❌ 后端验证时报错："策略代码语法错误"
- 或
- ❌ Worker 加载时报错，前端显示错误信息

#### 步骤 2：缺少导出

```python
import backtrader as bt

class MyStrategy(bt.Strategy):
    def next(self):
        pass

# 忘记添加 Strategy = MyStrategy
```

**预期结果**:
- ❌ 后端验证报错："未找到策略导出"
- 或
- ❌ Worker 加载报错

#### 步骤 3：危险代码

```python
import backtrader as bt
import os

class DangerousStrategy(bt.Strategy):
    def next(self):
        # 尝试执行系统命令
        os.system('echo "hacked"')
        pass

Strategy = DangerousStrategy
```

**预期结果**:
- ❌ Worker 安全检查失败："检测到危险代码模式: 使用了系统命令 os.system"
- ❌ 任务失败，错误上报到前端

---

### 测试场景 4：缓存测试

#### 步骤

1. **创建回测任务 1**
   - 使用 ThreeLineTrendAtrStrategy
   - 查看 Worker 日志：`Loading user strategy`

2. **立即创建回测任务 2**
   - 使用相同的策略
   - 查看 Worker 日志：应该看到 `Strategy loaded from cache`

3. **检查加载时间**
   - 第一次加载：~50ms
   - 缓存加载：~5ms

#### 预期结果

- ✅ 第二次加载使用缓存
- ✅ 加载时间显著缩短
- ✅ 两次回测结果一致

---

## 📊 监控指标

### Worker 日志关键信息

```
# 初始化
DynamicStrategyLoader initialized: cache=True, cache_size=100, security_check=True, timeout=5s
BacktestExecutor initialized: worker_id=..., strategy_loader enabled

# 加载策略
Loading user strategy: abc-123
Strategy loaded successfully: ThreeLineTrendAtrStrategy (id=abc-123)
User strategy loaded: ThreeLineTrendAtrStrategy

# 或从缓存加载
Strategy loaded from cache: abc-123

# 错误示例
Failed to load user strategy: 策略代码语法错误（行 5）: ...
```

### RabbitMQ 错误消息

如果策略加载失败，应该在 `error` 队列看到消息：

```json
{
  "taskId": "...",
  "workerId": "...",
  "error": "策略加载失败: ...",
  "errorType": "strategy_loading_error",
  "timestamp": 1234567890
}
```

---

## ✅ 验收清单

### 功能验收

- [ ] ✅ 已有策略（ThreeLineTrendAtrStrategy）能够正常加载和执行
- [ ] ✅ 新创建的策略能够正常加载和执行
- [ ] ✅ 做空交易正确显示在交易明细中
- [ ] ✅ 策略参数正确传递和生效
- [ ] ✅ 语法错误被正确捕获和报告
- [ ] ✅ 缺少导出被正确检测
- [ ] ✅ 危险代码被阻止
- [ ] ✅ 缓存机制正常工作
- [ ] ✅ 错误信息友好且准确

### 性能验收

- [ ] ✅ 策略加载时间 < 100ms（首次）
- [ ] ✅ 策略加载时间 < 10ms（缓存）
- [ ] ✅ 回测执行性能无明显下降
- [ ] ✅ Worker 内存占用正常

### 稳定性验收

- [ ] ✅ 策略错误不会导致 Worker 崩溃
- [ ] ✅ 多个任务并发执行正常
- [ ] ✅ 长时间运行无内存泄漏

---

## 🐛 已知问题和限制

### 当前限制

1. **安全性**
   - MVP 阶段仅有基础安全防护
   - 可能存在未覆盖的安全漏洞
   - 建议在生产环境增强安全措施

2. **性能**
   - 策略缓存基于代码哈希
   - 代码微小改动会导致缓存失效

3. **功能**
   - 不支持策略热更新（需要重新创建任务）
   - 不支持策略间通信

---

## 📚 相关文档

- [技术调研文档](./DYNAMIC_STRATEGY_LOADING_RESEARCH.md)
- [实施进度](./DYNAMIC_LOADING_IMPLEMENTATION_PROGRESS.md)
- [Sprint 1 总结](./DYNAMIC_LOADING_SPRINT1_SUMMARY.md)
- [策略开发指南](../../STRATEGY_DEVELOPMENT_GUIDE.md)

---

## 💡 问题排查

### 问题 1：Worker 未加载新代码

**症状**: 仍然使用硬编码的 RabbitMQStrategy

**解决**:
```bash
# 重启 Worker 服务
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
pkill -f start_rabbitmq_worker
python start_rabbitmq_worker.py
```

### 问题 2：策略加载失败但无错误信息

**症状**: 任务失败但前端无详细错误

**排查**:
1. 查看 Worker 日志
2. 查看 RabbitMQ 错误队列
3. 检查后端日志

### 问题 3：缓存未生效

**症状**: 每次都重新加载策略

**排查**:
1. 检查 Worker 日志中的 `cache=True`
2. 确认代码内容完全相同（包括空格）
3. 查看缓存统计：`loader.get_cache_stats()`

---

**准备开始测试！** 🚀

