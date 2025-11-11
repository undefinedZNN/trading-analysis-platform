# Sprint 1.3: 策略执行和监控 - 开发计划

**Sprint目标**: 实现策略的执行引擎和实时监控功能  
**优先级**: P0  
**预估时间**: 2-3天  
**开始时间**: 2025-11-10 18:45

---

## 📋 任务分解

### BE-106: 策略执行引擎 (核心)

#### 1. 架构设计 ✅
**目标**: 设计可扩展的执行引擎架构

**组件**:
```
ExecutionEngine (执行引擎)
├── StrategyLoader (策略加载器)
│   ├── 加载策略代码
│   ├── 编译和验证
│   └── 初始化策略实例
├── DataFeed (数据流)
│   ├── 历史数据回放
│   ├── 实时数据订阅
│   └── 数据缓冲管理
├── EventBus (事件总线)
│   ├── 策略事件
│   ├── 市场事件
│   └── 系统事件
└── StrategyExecutor (策略执行器)
    ├── 生命周期管理
    ├── 事件处理
    └── 状态管理
```

**技术选型**:
- 事件驱动架构
- RxJS处理数据流
- Worker线程隔离
- 状态机管理

#### 2. 策略加载器 (1-2小时)
**文件**: `backend/src/backtesting/execution/strategy-loader.service.ts`

**功能**:
- ✅ 从数据库加载策略
- ✅ 编译TypeScript代码
- ✅ 验证策略接口
- ✅ 创建策略实例
- ✅ 注入依赖

**接口**:
```typescript
class StrategyLoader {
  async loadStrategy(strategyId: string, versionId: string): Promise<StrategyInstance>
  async validateStrategy(code: string): Promise<ValidationResult>
  async createInstance(strategy: LoadedStrategy): Promise<StrategyInstance>
}
```

#### 3. 数据流管理 (1-2小时)
**文件**: `backend/src/backtesting/execution/data-feed.service.ts`

**功能**:
- 历史数据回放
- 时间轴控制
- 数据缓冲
- 多品种支持

**接口**:
```typescript
class DataFeed {
  subscribe(symbol: string, timeframe: string): Observable<MarketBar>
  replay(startTime: Date, endTime: Date, speed: number): Observable<MarketBar>
  pause(): void
  resume(): void
  seek(time: Date): void
}
```

#### 4. 策略执行器 (2-3小时)
**文件**: `backend/src/backtesting/execution/strategy-executor.service.ts`

**功能**:
- 策略生命周期管理
- 事件处理和分发
- 状态跟踪
- 错误处理和恢复

**接口**:
```typescript
class StrategyExecutor {
  async start(strategyId: string, config: ExecutionConfig): Promise<ExecutionSession>
  async stop(sessionId: string): Promise<void>
  async pause(sessionId: string): Promise<void>
  async resume(sessionId: string): Promise<void>
  getStatus(sessionId: string): ExecutionStatus
}
```

**状态机**:
```
IDLE → LOADING → RUNNING → PAUSED → STOPPED
                     ↓
                  ERROR
```

### BE-107: 执行监控 (辅助)

#### 1. 监控服务 (1-2小时)
**文件**: `backend/src/backtesting/execution/execution-monitor.service.ts`

**功能**:
- 实时状态监控
- 性能指标收集
- 资源使用统计
- 异常检测

**指标**:
```typescript
interface ExecutionMetrics {
  // 性能指标
  barsProcessed: number;
  eventsProcessed: number;
  executionTime: number;
  avgLatency: number;
  
  // 策略指标
  signalsGenerated: number;
  ordersPlaced: number;
  errors: number;
  
  // 资源指标
  memoryUsage: number;
  cpuUsage: number;
}
```

#### 2. WebSocket推送 (1小时)
**文件**: `backend/src/backtesting/execution/execution.gateway.ts`

**功能**:
- 实时状态推送
- 指标更新推送
- 日志流推送

**事件**:
```typescript
// 客户端订阅
socket.on('subscribe:execution', { sessionId })

// 服务端推送
socket.emit('execution:status', { status, metrics })
socket.emit('execution:log', { level, message })
socket.emit('execution:error', { error })
```

### FE-107: 执行控制面板 (前端)

#### 1. 执行控制组件 (1-2小时)
**文件**: `frontend/src/modules/backtesting/components/ExecutionControl.tsx`

**功能**:
- 启动/停止按钮
- 暂停/恢复按钮
- 速度控制
- 配置面板

#### 2. 状态展示组件 (1小时)
**文件**: `frontend/src/modules/backtesting/components/ExecutionStatus.tsx`

**功能**:
- 当前状态显示
- 进度条
- 时间信息
- 错误提示

#### 3. 性能图表组件 (1-2小时)
**文件**: `frontend/src/modules/backtesting/components/ExecutionMetrics.tsx`

**功能**:
- 实时性能图表
- 指标卡片
- 资源使用图

#### 4. 日志查看器 (1小时)
**文件**: `frontend/src/modules/backtesting/components/ExecutionLogs.tsx`

**功能**:
- 实时日志流
- 日志过滤
- 日志导出

---

## 🎯 开发顺序

### 第一阶段: 核心引擎 (4-6小时)
1. ✅ 架构设计和接口定义
2. 策略加载器实现
3. 数据流管理实现
4. 策略执行器实现
5. 单元测试

### 第二阶段: 监控系统 (2-3小时)
1. 监控服务实现
2. WebSocket网关实现
3. 指标收集和统计
4. 集成测试

### 第三阶段: 前端界面 (3-4小时)
1. 控制组件实现
2. 状态展示实现
3. 性能图表实现
4. 日志查看器实现
5. 前后端联调

---

## 📊 技术栈

### 后端
- **NestJS**: 框架
- **RxJS**: 响应式编程
- **Socket.io**: WebSocket
- **Bull**: 任务队列
- **TypeScript**: 类型安全

### 前端
- **React**: UI框架
- **Ant Design**: 组件库
- **ECharts**: 图表库
- **Socket.io-client**: WebSocket客户端
- **RxJS**: 数据流管理

---

## 🎨 UI设计

### 执行控制面板布局
```
┌─────────────────────────────────────────┐
│ 策略执行控制                              │
├─────────────────────────────────────────┤
│ [启动] [暂停] [停止] [重置]  速度: [1x▼] │
├─────────────────────────────────────────┤
│ 状态: 运行中 ●                            │
│ 进度: ████████░░ 80%                     │
│ 时间: 2024-01-01 → 2024-12-31           │
├─────────────────────────────────────────┤
│ 性能指标                                  │
│ ┌─────┬─────┬─────┬─────┐              │
│ │已处理 │信号数 │订单数 │错误数 │              │
│ │12,345│  156 │  89  │  0  │              │
│ └─────┴─────┴─────┴─────┘              │
├─────────────────────────────────────────┤
│ 实时日志                                  │
│ [INFO] 策略已启动                         │
│ [DEBUG] 处理Bar: 2024-01-01 09:30       │
│ [INFO] 生成买入信号                       │
│ [WARN] 仓位已满                          │
└─────────────────────────────────────────┘
```

---

## 📝 API设计

### 执行控制API
```typescript
// 启动执行
POST /api/v1/backtesting/execution/start
Body: {
  strategyId: string;
  versionId: string;
  config: {
    startTime: Date;
    endTime: Date;
    initialCapital: number;
    symbols: string[];
  }
}

// 停止执行
POST /api/v1/backtesting/execution/:sessionId/stop

// 暂停执行
POST /api/v1/backtesting/execution/:sessionId/pause

// 恢复执行
POST /api/v1/backtesting/execution/:sessionId/resume

// 获取状态
GET /api/v1/backtesting/execution/:sessionId/status

// 获取指标
GET /api/v1/backtesting/execution/:sessionId/metrics

// 获取日志
GET /api/v1/backtesting/execution/:sessionId/logs
```

---

## ✅ 验收标准

### 功能性
- [ ] 策略可以成功加载和初始化
- [ ] 数据流可以正常回放
- [ ] 策略生命周期正确执行
- [ ] 状态转换正确
- [ ] 错误可以正确处理

### 性能
- [ ] 处理速度 >1000 bars/s
- [ ] 内存使用 <500MB
- [ ] 延迟 <10ms
- [ ] CPU使用率 <80%

### 可靠性
- [ ] 异常自动恢复
- [ ] 状态持久化
- [ ] 日志完整记录
- [ ] 资源正确释放

### 用户体验
- [ ] 实时状态更新
- [ ] 响应式界面
- [ ] 清晰的错误提示
- [ ] 流畅的操作体验

---

## 🚀 开始开发

现在开始第一阶段: **核心引擎开发**

首先实现:
1. 策略加载器 (StrategyLoader)
2. 数据流管理 (DataFeed)
3. 策略执行器 (StrategyExecutor)

准备好了吗? 让我们开始! 🎯
