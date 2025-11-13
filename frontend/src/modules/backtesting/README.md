# 回测任务管理模块 - 前端开发指南

## 📦 模块结构

```
src/modules/backtesting/
├── components/
│   ├── DynamicParamsForm.tsx       # 动态参数渲染组件
│   ├── CreateBacktestTaskModal.tsx  # 创建任务表单
│   ├── BacktestTaskCard.tsx         # 任务卡片组件
│   ├── SchemaPreview.tsx            # Schema预览组件（已有）
│   └── index.ts                     # 组件导出
├── pages/
│   ├── BacktestTaskListPage.tsx     # 任务列表页面
│   ├── StrategyManagementLandingPage.tsx  # 策略管理页（已有）
│   └── index.ts                     # 页面导出
└── README.md                        # 本文档
```

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd backend
npm run start:dev
```

后端API将运行在 `http://localhost:3000`

### 2. 启动前端服务

```bash
cd frontend
npm run dev
```

前端应用将运行在 `http://localhost:5173`

### 3. 访问回测任务页面

打开浏览器访问:
- 任务列表页: `http://localhost:5173/backtesting/tasks`
- 策略管理页: `http://localhost:5173/backtesting/strategies`

## 📋 功能清单

### ✅ 已完成

#### API服务层 (`shared/api/backtestTasks.ts`)
- [x] 完整的TypeScript类型定义
- [x] 10个API方法封装
- [x] 状态枚举和常量定义

#### 组件
- [x] **DynamicParamsForm**: 根据Schema动态渲染表单字段
- [x] **CreateBacktestTaskModal**: 创建任务的完整表单
- [x] **BacktestTaskCard**: 任务卡片展示和操作
- [x] **BacktestTaskListPage**: 任务列表主页面

#### 路由
- [x] 添加 `/backtesting/tasks` 路由
- [x] 导航菜单集成

### ⏳ 待完成（Phase 3）

- [ ] 任务详情页面 (`TaskDetailPage.tsx`)
- [ ] 日志查看组件 (`TaskLogsViewer.tsx`)
- [ ] 结果图表组件 (`ResultCharts.tsx`)
- [ ] 交易明细表格 (`TradeDetailsTable.tsx`)
- [ ] 策略详情页深度集成

## 🧪 基础联调测试

### 测试前准备

1. **确保数据库迁移已执行**
   ```bash
   cd backend
   npm run typeorm:run-migrations
   ```

2. **确认后端服务正常**
   ```bash
   curl http://localhost:3000/api/v1/backtesting/health
   # 预期输出: {"status":"ok","module":"backtesting",...}
   ```

3. **确认后端API可访问**
   ```bash
   curl http://localhost:3000/api/v1/backtesting/tasks
   # 预期输出: {"tasks":[],"total":0,"page":1,"pageSize":20}
   ```

### 前端功能测试

#### 1. 页面访问测试
- [ ] 访问 `http://localhost:5173/backtesting/tasks`
- [ ] 确认页面正常加载，无控制台错误
- [ ] 确认左侧导航菜单显示"回测任务"菜单项

#### 2. 空状态测试
- [ ] 新系统应该显示空状态（Empty）
- [ ] 确认"创建第一个任务"按钮可见

#### 3. 创建任务表单测试（暂时需要mock数据）
- [ ] 点击"创建任务"按钮
- [ ] 模态框打开，表单字段正常渲染
- [ ] 必填字段显示星号标记
- [ ] 关闭模态框功能正常

**注意**: 由于创建任务需要策略ID和数据集ID，完整测试需要：
1. 先在"策略管理"页面创建一个策略
2. 在"数据集列表"中导入一个数据集
3. 然后才能完整测试创建任务流程

#### 4. 任务列表测试
- [ ] 筛选器功能正常（状态、排序）
- [ ] 搜索功能正常
- [ ] 刷新按钮工作
- [ ] 分页功能正常（如果有数据）

#### 5. 任务卡片测试
- [ ] 状态标签正确显示
- [ ] 操作按钮正常显示
- [ ] 点击"详情"按钮（暂时会报错，因为详情页未实现）

### API集成测试

使用浏览器开发者工具（Network）检查：

1. **页面加载时的API调用**
   ```
   GET /api/v1/backtesting/tasks?page=1&pageSize=12&sortBy=createdAt&sortOrder=desc
   ```
   - [ ] 请求正常发送
   - [ ] 响应状态码 200
   - [ ] 响应数据结构正确

2. **筛选和排序**
   - [ ] 改变筛选条件时API参数正确
   - [ ] 改变排序时API参数正确

3. **CORS检查**
   - [ ] 没有CORS错误
   - [ ] 请求头和响应头正确

### 错误处理测试

1. **后端服务停止**
   - [ ] 停止后端服务
   - [ ] 前端应显示错误提示
   - [ ] 不应该崩溃

2. **网络超时**
   - [ ] 使用浏览器开发者工具模拟慢速网络
   - [ ] 加载状态（Spin）正常显示

## 🐛 常见问题

### 1. API请求失败（CORS错误）

**问题**: `Access-Control-Allow-Origin` 错误

**解决方案**: 确保后端 `main.ts` 中启用了CORS：
```typescript
app.enableCors({
  origin: ['http://localhost:5173'],
  credentials: true,
});
```

### 2. 组件导入错误

**问题**: `Cannot find module` 错误

**解决方案**: 检查导出文件 `components/index.ts` 和 `pages/index.ts`

### 3. dayjs locale 错误

**问题**: `dayjs` 日期显示不是中文

**解决方案**: 确保安装了 dayjs 和相关插件：
```bash
npm install dayjs
```

并在组件中导入：
```typescript
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');
```

### 4. 创建任务表单提交失败

**可能原因**:
1. 策略ID不存在
2. 数据集ID不存在
3. 时间范围格式错误
4. 必填字段缺失

**调试方法**: 查看浏览器控制台和Network面板的详细错误信息

## 📝 开发建议

### 1. 组件复用

`DynamicParamsForm` 组件可以在其他需要动态表单的地方复用：
```tsx
import { DynamicParamsForm } from '@/modules/backtesting/components';

<DynamicParamsForm 
  parameterSchema={schema}
  namePrefix={['customParams']}
/>
```

### 2. API调用示例

```typescript
import { 
  listBacktestTasks,
  createBacktestTask,
  BacktestTaskStatus 
} from '@/shared/api/backtestTasks';

// 查询任务列表
const tasks = await listBacktestTasks({
  status: BacktestTaskStatus.RUNNING,
  page: 1,
  pageSize: 20,
});

// 创建任务
const newTask = await createBacktestTask({
  taskName: '测试任务',
  strategyId: 'xxx',
  scriptVersionId: 'xxx',
  datasetId: 1,
  // ... 其他配置
});
```

### 3. 状态管理建议

如果任务列表需要跨页面共享，建议使用React Context或Zustand等状态管理库。

示例（React Context）:
```typescript
// context/TaskContext.tsx
const TaskContext = createContext<{
  tasks: BacktestTask[];
  refresh: () => Promise<void>;
}>({ tasks: [], refresh: async () => {} });
```

## 🔗 相关链接

- [Backend API文档](../../../backend/src/backtesting/tasks/API_EXAMPLES.md)
- [数据库设计](../../../docs/prd/backtesting-strategy-management/backtest-task-management/design/DATABASE_DESIGN.md)
- [需求对齐文档](../../../docs/prd/backtesting-strategy-management/backtest-task-management/ALIGNMENT.md)

## 📅 下一步计划

### Phase 3 - 任务详情页（15个子任务）
1. 任务详情页框架
2. 执行日志查看器（支持pull-to-load）
3. 结果图表（收益曲线、回撤曲线）
4. 交易明细表格（支持CSV导出、因子筛选）
5. 交易报表入口（占位）

### Phase 4 - 优化和测试（3个子任务）
1. E2E测试
2. 性能优化
3. 文档完善

---

**开发团队**: 回测任务管理小组  
**最后更新**: 2025-11-13

