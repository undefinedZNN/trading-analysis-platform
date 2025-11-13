# 回测任务管理 - 前端组件总结

## 已完成组件

### 1. API服务层 (`shared/api/backtestTasks.ts`) ✅
- 完整的TypeScript类型定义
- 所有API接口封装（10个接口）
- 包括任务管理和日志查询

### 2. 动态参数渲染组件 (`DynamicParamsForm.tsx`) ✅
- 根据Schema动态渲染表单字段
- 支持多种输入类型（text、number、switch、select）
- 包含验证规则和提示信息

## 待实现组件

### 3. 创建任务表单 (`CreateBacktestTaskModal.tsx`) ✅ 已完成

**功能**:
- 模态框形式
- **支持两种创建场景**：
  - **场景1**：从策略列表/详情页创建（策略ID已知，只读显示策略名称）
  - **场景2**：从任务列表页创建（需要选择策略）
- 包含基本信息、策略配置、数据配置、执行配置
- 使用DynamicParamsForm渲染策略参数
- 表单验证和提交

**关键字段**:
- 任务名称、描述（支持自动生成）
- 策略选择/显示（根据场景）
- 脚本版本选择（默认master）
- 动态策略参数（根据版本Schema渲染）
- 数据集选择、时间范围（自动填充）
- 交易参数（初始资金、手续费等）

**调用示例**:
```tsx
// 场景1：从策略页创建
<CreateBacktestTaskModal
  open={open}
  onCancel={onCancel}
  onSuccess={onSuccess}
  strategyId={strategy.strategyId}  // ← 传入策略ID
  datasets={datasets}
/>

// 场景2：从任务列表页创建
<CreateBacktestTaskModal
  open={open}
  onCancel={onCancel}
  onSuccess={onSuccess}
  // strategyId 不传
  datasets={datasets}
/>
```

### 4. 任务卡片组件 (`BacktestTaskCard.tsx`)
**功能**:
- 卡片形式展示任务信息
- 状态标签（pending/running/completed/failed/cancelled）
- 进度条（运行中时显示）
- 操作按钮（查看详情、取消、重试、删除）
- 显示关键指标（收益率、最大回撤等）

### 5. 任务列表页面 (`BacktestTaskListPage.tsx`)
**功能**:
- 展示任务列表（卡片grid布局）
- 集成筛选器组件
- 分页加载
- 刷新按钮
- 跳转到任务详情

### 6. 筛选器组件 (`TaskFilters.tsx`)
**功能**:
- 关键词搜索
- 状态筛选
- 时间范围筛选
- 排序选项

## 实现建议

### 创建任务表单示例结构

```tsx
<Modal title="创建回测任务" open={open} onCancel={onCancel} width={800}>
  <Form form={form} layout="vertical" onFinish={handleSubmit}>
    {/* 基本信息 */}
    <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
      <Input />
    </Form.Item>
    
    {/* 策略选择 */}
    <Form.Item name="strategyId" label="选择策略">
      <Select />
    </Form.Item>
    
    <Form.Item name="scriptVersionId" label="脚本版本">
      <Select />
    </Form.Item>
    
    {/* 数据集配置 */}
    <Form.Item name="datasetId" label="数据集">
      <Select />
    </Form.Item>
    
    <Form.Item name={['dataConfig', 'timeRange']} label="时间范围">
      <RangePicker />
    </Form.Item>
    
    {/* 执行配置 */}
    <Form.Item name={['executionConfig', 'initialCapital']} label="初始资金">
      <InputNumber />
    </Form.Item>
    
    {/* 动态策略参数 */}
    <Divider>策略参数</Divider>
    <DynamicParamsForm parameterSchema={parameterSchema} />
    
    <Form.Item>
      <Button type="primary" htmlType="submit">创建任务</Button>
    </Form.Item>
  </Form>
</Modal>
```

### 任务卡片示例结构

```tsx
<Card>
  <div className="task-header">
    <h3>{task.taskName}</h3>
    <StatusTag status={task.status} />
  </div>
  
  {task.status === 'running' && (
    <Progress percent={task.progress} />
  )}
  
  <Descriptions column={2}>
    <Item label="创建时间">{task.createdAt}</Item>
    <Item label="状态">{task.status}</Item>
    {task.resultSummary && (
      <>
        <Item label="总收益">{task.resultSummary.totalReturn}</Item>
        <Item label="最大回撤">{task.resultSummary.maxDrawdown}</Item>
      </>
    )}
  </Descriptions>
  
  <div className="task-actions">
    <Button onClick={() => viewDetails(task.taskId)}>查看详情</Button>
    {task.status === 'running' && (
      <Button onClick={() => cancelTask(task.taskId)}>取消</Button>
    )}
    {task.status === 'failed' && (
      <Button onClick={() => retryTask(task.taskId)}>重试</Button>
    )}
  </div>
</Card>
```

## 状态管理建议

使用React Context或轻量级状态管理：

```tsx
// backtesting/context/TaskContext.tsx
interface TaskContextValue {
  tasks: BacktestTask[];
  loading: boolean;
  refetch: () => Promise<void>;
  createTask: (payload) => Promise<void>;
  cancelTask: (taskId) => Promise<void>;
}
```

## 路由配置

```tsx
// App.tsx 或路由配置文件
<Route path="/backtesting/tasks" element={<BacktestTaskListPage />} />
<Route path="/backtesting/tasks/:taskId" element={<TaskDetailPage />} />
<Route path="/backtesting/strategies/:strategyId" element={<StrategyDetailPage />} />
```

## 下一步开发顺序

1. ✅ API服务层
2. ✅ 动态参数组件
3. ⏳ 创建任务表单（核心功能）
4. ⏳ 任务卡片组件
5. ⏳ 筛选器组件
6. ⏳ 任务列表页面
7. ⏳ 集成到策略详情页
8. ⏳ 路由配置
9. ⏳ 联调测试

---

### 7. 任务详情页 (`pages/TaskDetailPage.tsx`) ✅ 已完成

**功能**:
- 面包屑导航
- 页面头部（任务名称、状态标签、操作按钮）
- 基本信息展示（任务ID、创建/开始/完成时间）
- Tab布局（5个Tab）
- 加载和错误处理
- 刷新功能

**Tab列表**:
1. ✅ 概览Tab - 已完成
2. ⏳ 执行日志Tab - 待开发
3. ⏳ 回测结果Tab - 待开发（仅完成状态可用）
4. ⏳ 交易明细Tab - 待开发（仅完成状态可用）
5. ⚠️ 交易报表Tab - 下一期功能（禁用）

**路由**:
- `/backtesting/tasks/:taskId`

### 8. 概览Tab组件 (`TaskOverviewTab.tsx`) ✅ 已完成

**功能**:
- **任务基本信息**: 任务ID、名称、描述、状态、创建/开始/完成时间、执行时长、创建者
- **策略信息**: 策略ID、脚本版本ID、策略参数（Descriptions展示）
- **数据配置**: 数据集ID、交易周期、回测时间范围
- **执行配置**: 初始资金、杠杆倍数、滑点设置、手续费配置、交易时段
- **执行状态**（运行中任务）:
  - 进度条（渐变色、动态更新）
  - 已运行时长（实时计算）
  - 已处理Bar数
- **错误信息**（失败任务）:
  - 错误消息（Alert展示）
  - 错误堆栈（Collapse折叠面板）
- **结果摘要**（完成任务）:
  - 8个关键指标统计卡片（总收益率、年化收益率、最大回撤、夏普比率、胜率、盈亏比、交易次数、最终资金）
  - 执行统计（已处理Bar数、执行时长）
- **结果数据**: 结果文件路径（如果有）

**特性**:
- 智能展示：根据任务状态自动显示相关卡片
- 时长格式化：使用dayjs duration插件
- 响应式布局：统计卡片自适应布局
- 可复制：重要ID支持一键复制
- 颜色语义：收益率用绿色/红色，回撤用红色

**调用示例**:
```tsx
<TaskOverviewTab task={task} />
```

---

**备注**: 由于前端组件较多且复杂，建议逐步实现。核心组件已完成基础架构（API层和动态参数），其余组件可以参考此文档中的示例结构进行实现。

### 9. 执行进度卡片 (`ExecutionProgressCard.tsx`) ✅ 已完成

**功能**:
- **进度条**: 渐变色进度条，显示百分比
- **已运行时长**: 实时计算并格式化显示（小时/分钟）
- **已处理Bar数**: 显示当前处理进度
- **预计剩余时间**: 基于当前进度估算剩余时间
- **实时状态提示**: 蓝色提示框，说明自动更新频率

**特性**:
- 仅在任务状态为RUNNING时显示
- 独立组件，可在其他页面复用
- 使用dayjs duration插件进行时长格式化

**调用示例**:
```tsx
<ExecutionProgressCard task={task} />
```

### 10. 错误信息卡片 (`TaskErrorCard.tsx`) ✅ 已完成

**功能**:
- **错误消息**: Alert组件展示错误类型和消息
- **错误堆栈**: 折叠面板展示格式化的堆栈信息
- **错误类型识别**: 自动提取错误类型（Error、TypeError等）
- **取消状态区分**: 区分失败和用户取消两种状态
- **处理建议**: 提供常见问题排查建议

**特性**:
- 支持FAILED和CANCELLED两种状态
- 错误堆栈格式化显示（Monaco字体、自动缩进）
- 独立组件，可在其他页面复用

**调用示例**:
```tsx
<TaskErrorCard task={task} />
```

### 11. 日志查看器Tab (`TaskLogsTab.tsx`) ✅ 已完成

**功能**:
- **日志统计**: 显示总数、错误、警告、信息日志数量
- **日志筛选**: 
  - 按级别筛选（DEBUG/INFO/WARN/ERROR）
  - 按关键词搜索（实时搜索）
  - 清空筛选按钮
- **日志列表**:
  - 日志级别图标和颜色标记
  - 模块标签（如果有）
  - 精确时间戳（毫秒级）
  - 日志消息（等宽字体）
  - 元数据展示（JSON格式，可折叠）
- **下拉加载更多**:
  - 向上滚动触发（加载更早的日志）
  - 自动恢复滚动位置
  - 加载提示和"已加载全部"提示
- **手动刷新**: 刷新按钮重新加载最新日志

**特性**:
- 日志倒序显示（最新的在下方，符合日志习惯）
- 每次加载50条日志
- 空状态和筛选无结果提示
- 使用ref监听滚动事件
- 独立的日志统计API调用

**调用示例**:
```tsx
<TaskLogsTab taskId={task.taskId} />
```

### 12. 进度轮询功能 ✅ 已完成

**位置**: `pages/TaskDetailPage.tsx`

**功能**:
- **自动轮询**: 当任务状态为RUNNING时，每60秒自动刷新任务详情
- **智能启停**: 
  - 任务完成时自动停止轮询
  - 组件卸载时清理定时器
- **状态指示**: 绿点 + 文字提示"自动刷新中（每分钟）"
- **手动刷新**: 刷新按钮随时可用

**实现细节**:
- 使用`useEffect`监听任务状态
- 使用`setInterval`定时触发
- 清理函数确保无内存泄漏
- 控制台日志便于调试

### 13. 回测结果Tab (`TaskResultsTab.tsx`) ✅ 已完成

**功能**:
- **整体表现评级**:
  - 智能评分系统（基于收益率、夏普比率、最大回撤）
  - 4档评级：优秀、良好、中等、较差
  - 回测周期和交易周期展示
- **收益指标卡片** (4个):
  - 总收益率（带涨跌图标和颜色）
  - 年化收益率
  - 最终资金
  - 初始资金（对比展示）
- **风险指标卡片** (4个):
  - 最大回撤（红色显示）
  - 夏普比率（带评级文字）
  - 风险收益比（自动计算）
  - 盈亏比
- **交易统计卡片** (4个):
  - 总交易次数
  - 胜率
  - 盈利交易次数（自动计算）
  - 亏损交易次数（自动计算）
- **执行统计卡片** (4个):
  - 已处理Bar数
  - 执行时长
  - 处理速度（Bar/秒，自动计算）
  - 平均交易频率（自动计算）
- **交易配置信息**:
  - 初始/最终资金对比
  - 杠杆、滑点、手续费
  - 交易时段（如果有）
- **图表占位区域**: 为P3-10图表集成预留
- **结果文件信息**: 文件路径和格式

**特性**:
- **智能评分**: 综合收益率、夏普比率、最大回撤三个维度
- **颜色语义化**: 
  - 绿色 = 盈利/正向
  - 红色 = 亏损/负向
  - 灰色 = 中性
- **自动计算**: 风险收益比、盈亏次数、处理速度、交易频率
- **响应式布局**: xs/sm/md/lg断点适配
- **条件渲染**: 仅在COMPLETED状态且有resultSummary时可用
- **20+个指标**: 全面展示回测结果

**调用示例**:
```tsx
<TaskResultsTab task={task} />
```

**代码统计**: ~450行

### 14. 回测图表组件 (`BacktestChartsCard.tsx`) ✅ 已完成

**功能**:
- **技术栈**: AntV G2Plot (v2.4.35)
- **3种图表视图**（Tab切换）:
  1. **权益曲线图**（Line）
     - 模拟权益增长曲线
     - 初始资金基准线（灰色虚线）
     - 绿色折线
     - 流畅动画（path-in, 1000ms）
     - 自定义Tooltip（货币格式）
     - Y轴货币格式化
  2. **回撤曲线图**（Line + Area）
     - 模拟回撤波动
     - 最大回撤基准线（红色虚线）
     - 红色折线 + 渐变填充
     - 百分比格式化
     - 负值Y轴
  3. **组合视图**（DualAxes 双轴图）
     - 左轴：权益（绿色）
     - 右轴：回撤（红色）
     - 双Y轴独立缩放
     - 共享X轴
     - 图例格式化（中文）
     - 共享Tooltip

**数据生成**:
- ✅ 基于回测结果摘要生成模拟数据
- ✅ 权益曲线：S型曲线 + 随机游走算法
- ✅ 回撤曲线：正弦波动 + 随机因子
- ✅ 100个数据点（可配置）
- ✅ TODO注释：为后续API集成预留

**图表生命周期**:
- ✅ useRef 管理图表实例
- ✅ useEffect 渲染和更新
- ✅ 组件卸载时自动销毁（destroy）
- ✅ 避免内存泄漏

**特性**:
- **响应式**: 自适应容器宽度（100%）
- **高度固定**: 400px
- **动画效果**: 路径动画，持续1秒
- **注释标注**: 
  - 初始资金水平线
  - 最大回撤水平线
- **数据说明**: Alert提示当前为模拟数据
- **条件渲染**: 无结果时显示警告

**调用示例**:
```tsx
<BacktestChartsCard task={task} />
```

**代码统计**: ~400行

**技术亮点**:
- ✅ AntV G2Plot 专业级图表
- ✅ 3种图表类型（Line, Area, DualAxes）
- ✅ 自定义数据生成算法
- ✅ 完善的内存管理
- ✅ 为真实数据预留接口

### 15. 交易明细Tab (`TaskTradesTab.tsx`) ✅ 已完成

**功能**:
- **统计卡片** (4个指标):
  - 总盈亏（颜色标识）
  - 盈利交易数（绿色）
  - 亏损交易数（红色）
  - 总手续费
- **筛选工具栏**:
  - 关键词搜索（Input）
  - 交易方向筛选（Select: 做多/做空）
  - 操作类型筛选（Select: 开仓/平仓）
  - 时间范围筛选（RangePicker）
  - 清空/应用筛选按钮
  - 刷新按钮
  - 导出CSV按钮（占位，P3-14实现）
- **交易表格** (11列):
  1. 交易ID（固定列，Code格式）
  2. 时间（可排序）
  3. 交易对（Tag，表格内筛选）
  4. 方向（Tag：做多绿/做空红，表格内筛选）
  5. 操作（Tag：开仓蓝/平仓橙，表格内筛选）
  6. 数量（可排序，4位小数）
  7. 价格（可排序，货币格式）
  8. 盈亏（可排序，颜色标识）
  9. 收益率（可排序，带箭头图标）
  10. 手续费（可排序，4位小数）
  11. 因子（Tooltip展示）

**表格特性**:
- ✅ 固定左侧列（交易ID）
- ✅ 6个列支持排序
- ✅ 3个列支持表格内筛选
- ✅ 分页（20条/页，可调整）
- ✅ 横向滚动（X: 1500px）
- ✅ 纵向滚动（Y: 600px）
- ✅ 小尺寸模式（节省空间）
- ✅ 响应式

**数据展示**:
- **颜色语义化**:
  - 绿色 = 做多/盈利
  - 红色 = 做空/亏损
  - 蓝色 = 交易对/开仓
  - 橙色 = 平仓
- **格式化**:
  - 货币：`$10,000.00`
  - 百分比：`+5.23%`
  - 涨跌箭头：↑/↓
  - 小数精度：4位
- **Tag标签**: 交易对、方向、操作
- **Tooltip**: 因子详细信息

**模拟数据**:
- ✅ 基于回测结果生成
- ✅ 随机交易对（BTC/ETH/BNB）
- ✅ 随机方向和操作
- ✅ 计算盈亏和收益率
- ✅ 模拟因子（RSI、MACD、Volume）
- ✅ TODO注释：API接入点

**调用示例**:
```tsx
<TaskTradesTab task={task} />
```

**代码统计**: ~500行

**预留功能**:
- ⏳ P3-12: 因子筛选器（高级筛选）
- ⏳ P3-14: CSV导出

---

## Phase 3 进度

- ✅ P3-01: 任务详情页框架（2025-11-13）
- ✅ P3-02: 概览Tab组件（2025-11-13）
- ✅ P3-03: 执行进度组件（2025-11-13）
- ✅ P3-04: 进度轮询（2025-11-13）
- ✅ P3-05: 错误信息展示（2025-11-13）
- ✅ P3-06: 日志查看器（2025-11-13）
- ✅ P3-07: 日志下拉加载（已在P3-06中实现）
- ✅ P3-08: 回测结果Tab（2025-11-13）
- ✅ P3-09: 指标卡片（已在P3-08中实现）
- ✅ P3-10: 图表集成（2025-11-13）
- ✅ P3-11: 交易明细Tab（2025-11-13）
- ⏳ P3-12: 因子筛选器（待开始）
- ⏳ P3-13: 交易表格（待开始）
- ⏳ P3-14: CSV导出（待开始）
- ⏳ P3-15: Tab集成测试（待开始）

