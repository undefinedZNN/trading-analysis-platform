# 🔧 Worker 管理脚本使用指南

**位置**: `/Volumes/CODE/trading-analysis-platform/backtest-worker/`

---

## 📋 可用脚本

| 脚本 | 用途 | 推荐度 |
|------|------|--------|
| `manage_worker.sh` | 🌟 完整Worker管理工具 | ⭐⭐⭐⭐⭐ |
| `stop_worker.sh` | 停止Worker | ⭐⭐⭐⭐ |
| `start_worker.sh` | 启动Worker | ⭐⭐⭐⭐⭐ |

---

## 🌟 推荐使用：`manage_worker.sh`

这是一个功能完整的Worker管理工具，包含所有常用操作。

### 基本用法

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 查看帮助
./manage_worker.sh help

# 查看状态
./manage_worker.sh status

# 启动Worker
./manage_worker.sh start

# 停止Worker（需确认）
./manage_worker.sh stop

# 强制停止（不确认）
./manage_worker.sh stop -f

# 重启Worker
./manage_worker.sh restart

# 查看日志
./manage_worker.sh logs

# 强制杀死（危险）
./manage_worker.sh kill
```

---

## 📖 详细说明

### 1️⃣ 查看Worker状态

```bash
./manage_worker.sh status
```

**输出示例**:
```
════════════════════════════════════════════════════════════════
    📊 Worker 状态
════════════════════════════════════════════════════════════════

✅ Worker 运行中

进程详情:
  PID: 12345
  CPU: 95.2%
  Memory: 2.3%
  Time: 00:05:23

注册信息:
  已注册: 1 个Worker

════════════════════════════════════════════════════════════════
```

---

### 2️⃣ 启动Worker

```bash
./manage_worker.sh start
```

**功能**:
- ✅ 检查是否已运行
- ✅ 启动新Worker进程
- ✅ 创建日志文件（带时间戳）
- ✅ 验证启动状态

**日志位置**: `logs/worker-YYYYMMDD-HHMMSS.log`

---

### 3️⃣ 停止Worker

#### 方法1：安全停止（推荐）

```bash
./manage_worker.sh stop
```

会先发送SIGTERM信号，给Worker时间优雅关闭。

#### 方法2：强制停止

```bash
./manage_worker.sh stop -f
```

跳过确认，直接停止。

#### 方法3：紧急终止（危险）

```bash
./manage_worker.sh kill
```

直接发送SIGKILL，立即终止。**可能导致任务异常！**

---

### 4️⃣ 重启Worker

```bash
./manage_worker.sh restart
```

等同于：`stop -f` → 等待2秒 → `start`

---

### 5️⃣ 查看日志

```bash
./manage_worker.sh logs
```

**功能**:
- 显示最新日志文件的最后50行
- 提示实时跟踪命令

**实时跟踪**:
```bash
# 脚本会提示这个命令
tail -f logs/worker-YYYYMMDD-HHMMSS.log
```

---

## 🛑 快速停止脚本：`stop_worker.sh`

如果你只需要快速停止Worker，可以使用这个简化脚本。

### 用法

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 停止（需确认）
./stop_worker.sh

# 强制停止（不确认）
./stop_worker.sh -f
./stop_worker.sh --force
```

### 特点
- ⚡ 简单直接
- ✅ 智能重试（先SIGTERM，失败后SIGKILL）
- 🔍 自动验证停止结果

---

## 🚀 启动脚本：`start_worker.sh`

原有的启动脚本，功能不变。

### 用法

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 直接启动
./start_worker.sh

# 后台运行并记录日志
./start_worker.sh > logs/worker.log 2>&1 &
```

---

## 💡 常见使用场景

### 场景1: 日常启动/停止

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 启动
./manage_worker.sh start

# 工作完成后停止
./manage_worker.sh stop
```

---

### 场景2: 应用代码修改

```bash
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 方法1: 使用restart命令
./manage_worker.sh restart

# 方法2: 手动停止-启动
./manage_worker.sh stop -f
./manage_worker.sh start
```

---

### 场景3: 排查问题

```bash
# 1. 检查状态
./manage_worker.sh status

# 2. 查看日志
./manage_worker.sh logs

# 3. 如果需要，重启
./manage_worker.sh restart
```

---

### 场景4: Worker卡死

```bash
# 尝试正常停止
./manage_worker.sh stop -f

# 如果失败，强制终止
./manage_worker.sh kill

# 重新启动
./manage_worker.sh start
```

---

### 场景5: 清理环境

```bash
# 停止所有Worker
./manage_worker.sh stop -f

# 清理RabbitMQ队列（可选）
docker exec trading-rabbitmq rabbitmqctl purge_queue -p /backtest backtest.tasks
```

---

## 🎯 快速参考

### 最常用命令

```bash
# 进入Worker目录
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 查看状态
./manage_worker.sh status

# 启动
./manage_worker.sh start

# 停止（快速）
./manage_worker.sh stop -f

# 重启
./manage_worker.sh restart

# 查看日志
./manage_worker.sh logs
```

---

## 📁 日志管理

### 日志位置

```
backtest-worker/
├── logs/
│   ├── worker-20251125-235501.log
│   ├── worker-20251126-000605.log
│   └── ...
```

### 清理旧日志

```bash
# 删除7天前的日志
find logs/ -name "worker-*.log" -mtime +7 -delete

# 只保留最新10个日志
ls -t logs/worker-*.log | tail -n +11 | xargs rm -f
```

---

## ⚠️ 注意事项

### 1. 停止Worker的影响

- **正在执行的任务**: 会被中断，状态可能不会更新
- **队列中的任务**: 不受影响，重启后继续处理
- **数据安全**: Backtrader会丢失未保存的状态

### 2. 建议操作

✅ **推荐**:
- 使用 `manage_worker.sh stop` 正常停止
- 等待任务完成后再停止
- 重启后检查孤儿任务

❌ **避免**:
- 频繁使用 `kill` 命令
- 在任务执行中途强制终止
- 不检查状态就重启

### 3. 故障恢复

如果Worker异常停止：

1. 检查日志：`./manage_worker.sh logs`
2. 清理队列：`docker exec trading-rabbitmq rabbitmqctl purge_queue -p /backtest backtest.tasks`
3. 重启Worker：`./manage_worker.sh start`
4. 检查孤儿任务（status=running但Worker已停止）

---

## 🔗 相关命令

### Backend控制

```bash
# 停止Backend
cd /Volumes/CODE/trading-analysis-platform/backend
npm run stop

# 启动Backend
npm run start:dev
```

### RabbitMQ控制

```bash
# 重启RabbitMQ
docker restart trading-rabbitmq

# 查看队列
docker exec trading-rabbitmq rabbitmqctl list_queues -p /backtest

# 清空队列
docker exec trading-rabbitmq rabbitmqctl purge_queue -p /backtest backtest.tasks
```

---

## 📞 问题排查

### Worker无法启动

```bash
# 1. 检查Python环境
which python3
python3 --version

# 2. 检查虚拟环境
ls -la venv/

# 3. 检查RabbitMQ连接
docker ps | grep rabbitmq
docker exec trading-rabbitmq rabbitmqctl status

# 4. 查看详细日志
./manage_worker.sh logs
```

### Worker启动后立即退出

```bash
# 查看日志找原因
./manage_worker.sh logs

# 常见原因：
# - Python依赖缺失
# - RabbitMQ连接失败
# - Backend未运行
```

---

## ✨ 总结

### 推荐工作流

```bash
# 1. 进入目录
cd /Volumes/CODE/trading-analysis-platform/backtest-worker

# 2. 检查状态
./manage_worker.sh status

# 3. 启动/停止/重启
./manage_worker.sh [start|stop|restart]

# 4. 查看日志（如需）
./manage_worker.sh logs
```

### 一键命令

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
alias worker-start='cd /Volumes/CODE/trading-analysis-platform/backtest-worker && ./manage_worker.sh start'
alias worker-stop='cd /Volumes/CODE/trading-analysis-platform/backtest-worker && ./manage_worker.sh stop -f'
alias worker-status='cd /Volumes/CODE/trading-analysis-platform/backtest-worker && ./manage_worker.sh status'
alias worker-restart='cd /Volumes/CODE/trading-analysis-platform/backtest-worker && ./manage_worker.sh restart'
alias worker-logs='cd /Volumes/CODE/trading-analysis-platform/backtest-worker && ./manage_worker.sh logs'
```

---

**创建时间**: 2025-11-26  
**版本**: 1.0  
**维护**: Trading Analysis Platform Team

