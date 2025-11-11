# 功能测试和验证计划

**测试时间**: 2025-11-11 00:37  
**测试范围**: Sprint 1.1 - 1.3 所有功能  

---

## 🎯 测试目标

验证以下功能模块:
1. ✅ 后端服务健康状态
2. ⏳ 策略管理功能
3. ⏳ 版本对比功能
4. ⏳ 策略执行功能
5. ⏳ 实时监控功能

---

## 🔧 测试环境

### 服务状态
- ✅ 后端服务: http://localhost:3000
- ✅ 前端服务: http://localhost:5174
- ✅ API文档: http://localhost:3000/api/docs
- ✅ 数据库: PostgreSQL (已连接)

---

## 📋 测试用例

### 1. 后端服务健康检查 ✅

#### 测试步骤:
```bash
# 健康检查
curl http://localhost:3000/api/v1/health

# 预期结果:
{
  "status": "ok",
  "timestamp": "...",
  "service": "trading-analysis-backend",
  "version": "1.0.0"
}
```

**状态**: ✅ 通过

---

### 2. 策略管理功能测试

#### 2.1 获取策略列表
```bash
curl http://localhost:3000/api/v1/backtesting/strategies
```

**预期**: 返回策略列表(可能为空)

#### 2.2 创建新策略
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试策略",
    "description": "这是一个测试策略",
    "tags": ["测试", "演示"],
    "initialVersion": {
      "code": "// 策略代码"
    }
  }'
```

**预期**: 返回创建的策略信息

#### 2.3 获取策略详情
```bash
curl http://localhost:3000/api/v1/backtesting/strategies/{strategyId}
```

**预期**: 返回策略详细信息

#### 2.4 更新策略
```bash
curl -X PATCH http://localhost:3000/api/v1/backtesting/strategies/{strategyId} \
  -H "Content-Type: application/json" \
  -d '{
    "description": "更新后的描述",
    "tags": ["测试", "更新"]
  }'
```

**预期**: 返回更新后的策略信息

---

### 3. 版本管理功能测试

#### 3.1 创建新版本
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/strategies/{strategyId}/script-versions \
  -H "Content-Type: application/json" \
  -d '{
    "code": "// 新版本代码",
    "versionName": "v1.1.0",
    "remark": "修复bug"
  }'
```

**预期**: 返回新版本信息

#### 3.2 设置主版本
```bash
curl -X PATCH http://localhost:3000/api/v1/backtesting/strategies/{strategyId}/script-versions/{versionId} \
  -H "Content-Type: application/json" \
  -d '{
    "isMaster": true
  }'
```

**预期**: 成功设置主版本

#### 3.3 版本对比
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/strategies/{strategyId}/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceVersionId": "v1",
    "targetVersionId": "v2",
    "mode": "full"
  }'
```

**预期**: 返回版本差异信息

---

### 4. 策略执行功能测试

#### 4.1 启动执行
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/execution/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "{strategyId}",
    "versionId": "{versionId}",
    "startTime": "2024-01-01T00:00:00Z",
    "endTime": "2024-12-31T23:59:59Z",
    "initialCapital": 100000,
    "symbols": ["BTCUSDT"],
    "timeframe": "1d",
    "speed": 1
  }'
```

**预期**: 返回执行会话信息

#### 4.2 获取执行状态
```bash
curl http://localhost:3000/api/v1/backtesting/execution/{sessionId}/status
```

**预期**: 返回当前执行状态

#### 4.3 获取执行指标
```bash
curl http://localhost:3000/api/v1/backtesting/execution/{sessionId}/metrics
```

**预期**: 返回执行指标

#### 4.4 暂停执行
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/execution/{sessionId}/pause
```

**预期**: 执行暂停

#### 4.5 恢复执行
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/execution/{sessionId}/resume
```

**预期**: 执行恢复

#### 4.6 停止执行
```bash
curl -X POST http://localhost:3000/api/v1/backtesting/execution/{sessionId}/stop
```

**预期**: 执行停止

---

### 5. 前端界面测试

#### 5.1 策略管理页面
**URL**: http://localhost:5174/backtesting/strategies

**测试项**:
- [ ] 页面正常加载
- [ ] 策略列表显示
- [ ] 创建策略按钮
- [ ] 搜索和筛选功能
- [ ] 标签管理

#### 5.2 策略详情页面
**测试项**:
- [ ] 详情信息显示
- [ ] 版本列表显示
- [ ] 代码编辑器
- [ ] 保存功能
- [ ] 版本操作(复制、对比)

#### 5.3 版本对比页面
**测试项**:
- [ ] 代码diff显示
- [ ] Schema对比
- [ ] 版本选择
- [ ] 对比模式切换

#### 5.4 策略执行页面
**URL**: http://localhost:5174/backtesting/execution/{strategyId}/{versionId}

**测试项**:
- [ ] 页面正常加载
- [ ] 执行控制面板
- [ ] 参数配置表单
- [ ] 启动/停止/暂停按钮
- [ ] 速度控制滑块

#### 5.5 实时监控
**测试项**:
- [ ] 状态实时更新
- [ ] 指标卡片显示
- [ ] 性能图表更新
- [ ] CPU/内存监控
- [ ] 日志实时显示
- [ ] 异常告警

---

### 6. WebSocket功能测试

#### 6.1 连接测试
**工具**: 浏览器开发者工具 -> Network -> WS

**测试项**:
- [ ] WebSocket连接成功
- [ ] 订阅会话成功
- [ ] 接收状态更新
- [ ] 接收指标更新
- [ ] 接收日志推送
- [ ] 接收资源统计
- [ ] 接收异常告警

---

## 🧪 测试脚本

### 快速API测试脚本
```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api/v1"

echo "=== 1. 健康检查 ==="
curl -s $BASE_URL/health | jq .

echo -e "\n=== 2. 获取策略列表 ==="
curl -s $BASE_URL/backtesting/strategies | jq .

echo -e "\n=== 3. 创建测试策略 ==="
STRATEGY=$(curl -s -X POST $BASE_URL/backtesting/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "自动测试策略",
    "description": "API测试创建",
    "tags": ["测试"],
    "initialVersion": {
      "code": "// 测试代码"
    }
  }')
echo $STRATEGY | jq .

STRATEGY_ID=$(echo $STRATEGY | jq -r '.strategyId')
echo "策略ID: $STRATEGY_ID"

echo -e "\n=== 4. 获取策略详情 ==="
curl -s $BASE_URL/backtesting/strategies/$STRATEGY_ID | jq .

echo -e "\n测试完成!"
```

---

## 📊 测试结果记录

### 后端API测试
| 功能 | 端点 | 状态 | 备注 |
|------|------|------|------|
| 健康检查 | GET /health | ✅ | 正常 |
| 策略列表 | GET /strategies | ⏳ | 待测试 |
| 创建策略 | POST /strategies | ⏳ | 待测试 |
| 策略详情 | GET /strategies/:id | ⏳ | 待测试 |
| 更新策略 | PATCH /strategies/:id | ⏳ | 待测试 |
| 创建版本 | POST /strategies/:id/script-versions | ⏳ | 待测试 |
| 版本对比 | POST /strategies/:id/compare | ⏳ | 待测试 |
| 启动执行 | POST /execution/start | ⏳ | 待测试 |
| 执行状态 | GET /execution/:id/status | ⏳ | 待测试 |
| 执行指标 | GET /execution/:id/metrics | ⏳ | 待测试 |

### 前端界面测试
| 页面 | URL | 状态 | 备注 |
|------|-----|------|------|
| 策略管理 | /backtesting/strategies | ⏳ | 待测试 |
| 策略详情 | /backtesting/strategies/:id | ⏳ | 待测试 |
| 版本对比 | /backtesting/compare/:id | ⏳ | 待测试 |
| 策略执行 | /backtesting/execution/:id/:vid | ⏳ | 待测试 |

### WebSocket测试
| 事件 | 状态 | 备注 |
|------|------|------|
| 连接 | ⏳ | 待测试 |
| 订阅会话 | ⏳ | 待测试 |
| 状态更新 | ⏳ | 待测试 |
| 指标更新 | ⏳ | 待测试 |
| 日志推送 | ⏳ | 待测试 |
| 资源统计 | ⏳ | 待测试 |

---

## 🐛 问题记录

### 发现的问题
1. [ ] 问题描述
   - 重现步骤:
   - 预期结果:
   - 实际结果:
   - 优先级:

---

## ✅ 测试总结

**测试进度**: 0/50 (0%)

**通过率**: -

**关键发现**:
- 待测试

**改进建议**:
- 待测试

---

**测试人员**: AI Assistant  
**测试时间**: 2025-11-11 00:37  
**测试环境**: 本地开发环境
