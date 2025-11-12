# 回测任务管理 - 实现总结

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: ✅ 需求已对齐

---

## 📋 需求对齐总结

本文档总结了回测任务管理模块的最终确认需求，作为开发实施的依据。

---

## 1. 创建回测任务

### 1.1 入口设计
- **位置**：策略列表每行添加"开始回测"按钮
- **触发方式**：弹窗表单（800px宽度）

### 1.2 表单字段

#### 步骤1：基本信息
- 策略信息（只读展示）
- 脚本版本（默认master，允许切换）
- 任务名称（必填）
- 任务描述（可选）

#### 步骤2：数据配置
- 数据集选择（必选，来自 `DatasetEntity`）
- 时间范围（默认数据集全部时间，可修改但限制在数据集范围内）
- 交易时间周期（默认数据集granularity，可选更大周期）

#### 步骤3：交易配置
- 初始资金（必填，默认$10,000）
- 手续费设置（Maker 0.02% / Taker 0.05%）
- 高级配置（折叠）：交易时段（可选）

**MVP不实现**：
- ❌ 杠杆倍数（后端固定传 `leverage: 1`）
- ❌ 滑点设置（后端固定传 `slippage: 0`）

#### 步骤4：策略参数
- 根据 `parameterSchema` 动态渲染表单

### 1.3 提交行为
- ✅ 提交成功后跳转到**任务详情页**（`/backtesting/tasks/:taskId`）

---

## 2. 回测任务列表

### 2.1 展示方式
- ✅ **统一使用卡片模式**（独立页面 + 策略详情页）

### 2.2 卡片内容

#### 运行中任务卡片
```
┌─────────────────────────────────────────────┐
│ 🚀 任务名称           [运行中]  创建于2小时前│
│                                             │
│ 📊 基本信息                                 │
│ 策略版本: v1.2.0 (Master)                   │
│ 数据集: BTCUSDT 1m                          │
│ 时间范围: 2024-01-01 ~ 2024-12-31          │
│                                             │
│ 📈 执行进度                                 │
│ ████████████████░░░░ 45%                   │
│ 已处理: 236,520 / 525,600 K线              │
│                                             │
│ [查看详情] [取消任务]                       │
└─────────────────────────────────────────────┘
```

#### 完成任务卡片
```
┌─────────────────────────────────────────────┐
│ ✅ 任务名称           [完成]  完成于1天前   │
│                                             │
│ 📊 基本信息                                 │
│ 策略版本: v2.0.1                            │
│ 数据集: ETHUSDT 5m                          │
│                                             │
│ 💰 回测结果                                 │
│ 总收益率: +23.5% ↑  最大回撤: -12.3% ↓     │
│ 交易次数: 156笔     胜率: 62.8%             │
│                                             │
│ [查看详情] [复制配置] [删除]                │
└─────────────────────────────────────────────┘
```

### 2.3 筛选器

#### 独立任务页面（`/backtesting/tasks`）
- 搜索框（任务名称）
- 策略筛选
- **版本筛选**（联动策略）
- 状态筛选
- 时间范围筛选
- 排序方式

#### 策略详情页下方
- **版本筛选**
- 状态筛选（Radio Button）
- 排序方式

### 2.4 操作按钮

| 状态 | 操作 |
|------|------|
| **pending** | 查看详情、取消 |
| **running** | 查看详情、取消 |
| **completed** | 查看详情、复制配置、删除 |
| **failed** | 查看详情、重试、删除 |
| **cancelled** | 查看详情、重新运行、删除 |

---

## 3. 回测任务详情页

### 3.1 页面布局

```
┌─────────────────────────────────────────────┐
│ ← 返回  任务名称              [状态标签]     │
├─────────────────────────────────────────────┤
│ [📊概览] [📈日志] [💰结果] [📋明细] [📊报表]│
├─────────────────────────────────────────────┤
│ (Tab内容区域)                                │
└─────────────────────────────────────────────┘
```

### 3.2 Tab 1: 📊 概览

**适用状态**：所有状态

**内容**：
- 任务基本信息卡片
- 策略配置卡片（含策略参数）
- 数据配置卡片
- 执行配置卡片
- **执行进度卡片**（运行中状态）
  - 进度条 + 统计信息
  - 上次更新时间
  - **主动刷新按钮**
  - **每1分钟自动刷新一次**
- **错误信息卡片**（失败状态）

### 3.3 Tab 2: 📈 执行日志

**适用状态**：running、completed、failed、cancelled

**内容**：
- 日志查看器（黑色终端风格）
- 日志级别筛选
- 关键词搜索
- **主动刷新按钮**
- ✅ **下拉加载更多日志**（非实时SSE）

**日志加载逻辑**：
1. 初始加载最新100条日志
2. 向上滚动到顶部时，加载更早的日志
3. 用户可点击刷新按钮加载最新日志
4. ❌ 不支持日志导出

### 3.4 Tab 3: 💰 回测结果

**适用状态**：completed

**内容**：
- 核心指标卡片（8个）
  - 总收益率、年化收益率、最大回撤、夏普比率
  - 交易次数、胜率、盈亏比、最终资金
- 图表
  - 收益曲线（折线图）
  - 回撤曲线（面积图）
- 详细指标表格

### 3.5 Tab 4: 📋 交易明细

**适用状态**：completed

**内容**：
- ✅ **因子筛选器**（优先展示）
  - **系统因子**：交易方向、盈亏情况、持仓K线数、收益率
  - **自定义因子**：根据策略的 `factorSchema` 动态渲染
  - 支持多条件组合筛选（AND逻辑）
  - 显示筛选结果数量
- 交易明细表格
  - 交易ID、开仓/平仓时间、方向、价格、数量
  - 盈亏、收益率、持仓时长
  - 支持排序、筛选
- 交易详情抽屉
  - 基本信息、价格信息、盈亏信息
  - 自定义因子（如果有）
- ✅ **导出CSV按钮**

**因子筛选器类型支持**：
- `number/integer`：范围筛选（最小-最大）
- `boolean`：是/否选择
- `enum`：多选下拉框
- `string`：关键词搜索

### 3.6 Tab 5: 📊 交易报表

**适用状态**：completed（下一期实现）

**内容**：
- 显示为禁用状态
- 标记"敬请期待"标签
- 空状态提示"交易报表功能将在下一期实现"

**规划功能**：
- 多维度交易分析报表
- 因子相关性分析
- 交易热力图
- 时间分布分析
- 持仓周期分析
- 自定义报表模板

### 3.7 Tab可用性

| Tab | pending | running | completed | failed | cancelled |
|-----|---------|---------|-----------|--------|-----------|
| 概览 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 执行日志 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 回测结果 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 交易明细 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 交易报表 | ❌ | ❌ | 🔄 | ❌ | ❌ |

---

## 4. 页面路由结构

```
/backtesting
  /strategies                      - 策略管理页
    /:strategyId                   - 策略详情页
                                     - 上方: 概览、版本、参数、因子
                                     - 下方: 回测任务列表（卡片）
  
  /tasks                           - 回测任务管理页
                                     - 任务列表（卡片）
                                     - 完整筛选器
    /:taskId                       - 任务详情页
                                     - 5个Tab
```

---

## 5. 数据模型设计

### 5.1 BacktestTask 实体

```typescript
interface BacktestTask {
  // 基本信息
  taskId: string;
  taskName: string;
  taskDescription?: string;
  
  // 关联关系
  strategyId: string;
  scriptVersionId: string;
  datasetId: number;
  
  // 配置
  dataConfig: {
    timeRange: {
      start: string;  // ISO 8601
      end: string;
    };
    timeframe: string;
  };
  
  strategyParams: Record<string, any>;
  
  executionConfig: {
    initialCapital: number;
    leverage: number;           // MVP固定为1
    slippage: number;            // MVP固定为0
    fees: {
      makerFee: number;
      takerFee: number;
    };
    tradingHours?: {
      start: string;
      end: string;
    };
  };
  
  // 状态
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  
  // 进度（运行中）
  progress?: {
    percentage: number;
    processedBars: number;
    totalBars: number;
    speed: number;
    tradesCount: number;
    estimatedTimeRemaining: number;
    lastUpdatedAt: string;
  };
  
  // 结果（完成）
  result?: {
    totalReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    totalTrades: number;
    winRate: number;
    profitLossRatio: number;
    finalCapital: number;
    // ... 更多指标
  };
  
  // 错误信息（失败）
  errorMessage?: string;
  errorStack?: string;
  
  // 时间戳
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  
  // 审计
  createdBy?: string;
}
```

### 5.2 Trade 实体

```typescript
interface Trade {
  tradeId: string;
  taskId: string;
  
  // 交易信息
  entryTime: string;
  exitTime: string;
  direction: 'LONG' | 'SHORT';
  
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  
  // 盈亏
  profitLoss: number;
  returnPct: number;
  fees: number;
  
  // 持仓
  holdingPeriod: number;  // 毫秒
  holdingBars: number;     // K线数
  
  // 自定义因子
  customFactors?: Record<string, any>;
}
```

### 5.3 TaskLog 实体

```typescript
interface TaskLog {
  id: string;
  taskId: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}
```

---

## 6. API 接口设计

### 6.1 任务管理

```typescript
// 创建任务
POST /api/backtesting/tasks
Body: CreateBacktestTaskDto
Response: { taskId: string }

// 任务列表
GET /api/backtesting/tasks
Query: {
  strategyId?: string;
  scriptVersionId?: string;
  status?: string;
  createdAfter?: string;
  createdBefore?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
Response: {
  tasks: BacktestTask[];
  total: number;
  page: number;
  pageSize: number;
}

// 任务详情
GET /api/backtesting/tasks/:taskId
Response: BacktestTask

// 取消任务
POST /api/backtesting/tasks/:taskId/cancel
Response: { success: boolean }

// 重试任务
POST /api/backtesting/tasks/:taskId/retry
Response: { taskId: string }

// 删除任务
DELETE /api/backtesting/tasks/:taskId
Response: { success: boolean }

// 复制任务配置
POST /api/backtesting/tasks/:taskId/copy
Response: CreateBacktestTaskDto
```

### 6.2 日志管理

```typescript
// 获取日志（分页）
GET /api/backtesting/tasks/:taskId/logs
Query: {
  before?: string;  // 日志ID，获取更早的日志
  limit?: number;   // 默认100
  level?: string;   // 日志级别筛选
  keyword?: string; // 关键词搜索
}
Response: {
  logs: TaskLog[];
  hasMore: boolean;
}
```

### 6.3 交易明细

```typescript
// 获取交易列表
GET /api/backtesting/tasks/:taskId/trades
Query: {
  // 系统因子筛选
  direction?: 'LONG' | 'SHORT';
  profitLoss?: 'profit' | 'loss';
  holdingBarsMin?: number;
  holdingBarsMax?: number;
  returnPctMin?: number;
  returnPctMax?: number;
  
  // 自定义因子筛选（JSON）
  customFactors?: string;
  
  // 分页排序
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
Response: {
  trades: Trade[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
}

// 导出交易明细
GET /api/backtesting/tasks/:taskId/trades/export
Query: {
  format: 'csv';
  // 支持同样的筛选参数
}
Response: File download
```

---

## 7. 技术实现要点

### 7.1 进度更新机制
- ✅ 每1分钟轮询一次任务状态
- ✅ 提供主动刷新按钮
- ❌ 不使用SSE实时推送

### 7.2 日志加载策略
- ✅ 下拉加载更多（类似聊天记录）
- ✅ 每次加载100条
- ✅ 保持滚动位置
- ❌ 不使用SSE实时推送

### 7.3 因子筛选实现
- 后端根据筛选条件查询数据库
- 支持复杂条件组合（AND逻辑）
- 自定义因子存储在JSONB字段
- 前端动态渲染筛选表单

### 7.4 CSV导出
- 后端生成CSV文件流
- 支持大数据量导出（流式处理）
- 文件名格式：`{taskName}-trades-{timestamp}.csv`

---

## 8. MVP范围确认

### 8.1 本期实现 ✅
1. ✅ 创建回测任务（完整表单）
2. ✅ 回测任务列表（卡片模式）
3. ✅ 任务详情页（4个Tab）
4. ✅ 执行进度（1分钟刷新 + 主动刷新）
5. ✅ 执行日志（下拉加载）
6. ✅ 回测结果（指标 + 图表）
7. ✅ 交易明细（因子筛选 + CSV导出）
8. ✅ 版本筛选支持

### 8.2 本期不实现 ❌
1. ❌ 杠杆倍数UI（后端固定传1）
2. ❌ 滑点设置UI（后端固定传0）
3. ❌ 日志导出功能
4. ❌ 交易明细Parquet/Excel导出
5. ❌ 交易报表Tab（下一期）

### 8.3 下一期规划 🔄
1. 🔄 交易报表功能
2. 🔄 任务暂停/恢复
3. 🔄 任务优先级
4. 🔄 任务快照/恢复
5. 🔄 批量操作

---

## 9. 开发顺序建议

### Phase 1: 数据库 & 后端 API
1. 创建数据库表（backtest_tasks、trades、task_logs）
2. 实现任务CRUD API
3. 实现日志分页API
4. 实现交易列表 & 筛选API
5. 实现CSV导出

### Phase 2: 前端基础
1. 创建任务表单（弹窗）
2. 任务列表页面（卡片）
3. 策略详情页集成任务列表
4. 路由配置

### Phase 3: 任务详情页
1. 概览Tab（基本信息 + 配置）
2. 执行进度（轮询 + 刷新）
3. 执行日志（下拉加载）
4. 回测结果（指标 + 图表）
5. 交易明细（筛选 + 导出）

### Phase 4: 优化 & 测试
1. 交互优化（加载状态、错误处理）
2. 响应式布局
3. 性能优化
4. 端到端测试

---

## 10. 文档清单

已创建的设计文档：

1. ✅ `CREATE_TASK_FLOW.md` - 创建任务交互流程
2. ✅ `TASK_VIEW_DESIGN.md` - 任务查看入口设计
3. ✅ `TASK_LIST_DETAIL_DESIGN.md` - 任务列表和详情页设计
4. ✅ `IMPLEMENTATION_SUMMARY.md` - 实现总结（本文档）

配套参考文档：
- `REQUIREMENTS.md` - 详细需求
- `DASHBOARD.md` - 任务追踪仪表盘
- `ALIGNMENT.md` - 需求对齐记录
- `DATABASE_DESIGN.md` - 数据库设计
- `API_DESIGN.md` - API接口设计

---

**状态**: ✅ 需求已完全对齐  
**准备状态**: ✅ 可以开始开发  
**预计工作量**: 约15-20个工作日

**下一步**: 开始Phase 1 - 数据库 & 后端API开发

