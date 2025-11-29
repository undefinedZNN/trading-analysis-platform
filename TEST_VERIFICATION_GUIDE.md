# 🧪 修复验证指南

## 📊 修复内容

### ✅ 已修复的问题
1. **Worker消息格式**: `send_result` 方法现在将 `files` 字段提取到消息顶层
2. **Backend消费**: Backend可以正确解析 `message.files.trades` 和 `message.files.equity`
3. **系统状态**: Worker已重启并加载修复代码

---

## 🎯 验证步骤

### 步骤1: 从前端创建测试任务

**访问**: http://localhost:5173

**推荐配置**:
```
任务名: 修复验证测试
数据集: ES-23/ES/5m
开始时间: 2022-12-15
结束时间: 2022-12-16 (只选1天！)
信号周期: 5m
初始资金: 100000
```

**预期结果**:
- 执行时间: ~0.1秒
- 交易数: 5笔左右
- 收益率: 正常波动

---

### 步骤2: 使用监控脚本验证

创建任务后，复制任务ID，运行：

```bash
/tmp/monitor_test.sh <任务ID>
```

**监控脚本功能**:
- ✅ 实时显示任务状态和进度
- ✅ 验证Backend是否接收到文件路径
- ✅ 验证交易明细API是否返回数据
- ✅ 显示前3条交易记录
- ✅ 提供详细的验证结论

---

## ✅ 验证要点

### 1. Backend API返回
```bash
curl http://localhost:3000/api/v1/backtesting/tasks/<TASK_ID>
```

**期望**:
- `tradesFilePath`: 有值，如 `backtests/<task-id>/trades.parquet`
- `equityFilePath`: 有值，如 `backtests/<task-id>/equity.parquet`
- `totalTrades`: 有值，如 `5`
- `totalReturn`: 有值，如 `0.52`

### 2. 交易明细API
```bash
curl http://localhost:3000/api/v1/backtesting/tasks/<TASK_ID>/trades?page=1&pageSize=5
```

**期望**:
- `total`: 有值，如 `5`
- `data`: 数组有数据，每条记录包含 `entryPrice`, `exitPrice`, `pnl` 等字段

### 3. 前端显示
打开任务详情页面，期望看到：
- ✅ 任务统计卡片显示交易数和收益率
- ✅ 交易明细列表显示所有交易记录
- ✅ 每条交易记录包含入场/出场时间、价格、盈亏等信息

---

## 🔍 故障排查

### 如果 `tradesFilePath` 为 null

**原因**: Worker发送的消息格式不正确

**检查**:
```bash
tail -50 /tmp/worker-*.log | grep "files\|completed successfully"
```

**期望日志**: 应该看到包含 `files` 字段的日志

**修复**:
```bash
# 重启Worker
cd /Volumes/CODE/trading-analysis-platform/backtest-worker
./manage_worker.sh restart
```

---

### 如果交易明细API无数据

**原因**: Backend无法读取Parquet文件或路径不匹配

**检查**:
```bash
# 查看Backend日志
docker logs trading-backend --tail 50 2>&1 | grep -i "parquet\|error"

# 检查文件是否存在
find /Volumes/CODE/trading-analysis-platform/backend/storage -name "trades*.parquet" -path "*<TASK_ID>*"
```

**修复**: 检查 `backend/src/backtesting/tasks/services/backtest-tasks.service.ts` 的文件读取逻辑

---

### 如果前端不显示数据

**原因**: 前端组件未正确读取API数据

**检查**: 打开浏览器开发者工具，查看Network面板的API响应

**修复**: 检查 `frontend/src/modules/backtesting/components/BacktestTaskCard.tsx` 的数据绑定

---

## 📈 系统状态

当前系统状态:
- ✅ Worker运行中 (PID: 68386)
- ✅ Backend运行中
- ✅ Frontend运行中
- ✅ RabbitMQ正常
- ✅ 修复代码已加载

---

## 🎯 成功标准

修复验证**成功**的标志:
1. ✅ Backend API返回 `tradesFilePath` 有值
2. ✅ 交易明细API返回 `data` 数组有数据
3. ✅ 前端任务详情页面显示交易数和收益率
4. ✅ 前端交易明细列表显示所有交易记录

---

## 🚀 开始测试

运行以下命令查看系统状态和指引:
```bash
cat /Volumes/CODE/trading-analysis-platform/TEST_VERIFICATION_GUIDE.md
```

准备就绪！请按步骤1从前端创建任务开始验证。🎉


