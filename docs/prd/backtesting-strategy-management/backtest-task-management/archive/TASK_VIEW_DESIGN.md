# 回测任务查看入口设计

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: 🟡 待确认

---

## 📋 问题描述

**用户需求**：用户在哪里可以查看到当前策略的回测任务？

---

## 💡 方案对比

### 方案1：独立的回测任务管理页面（推荐 ⭐）

#### 设计
- **路由**：`/backtesting/tasks`
- **入口**：顶部导航菜单添加"回测任务"菜单项
- **页面布局**：
  ```
  ┌───────────────────────────────────────────────────────┐
  │  回测任务                                   [+ 创建任务] │
  ├───────────────────────────────────────────────────────┤
  │  搜索: [_________]  策略: [全部 ▼]  状态: [全部 ▼]    │
  ├───────────────────────────────────────────────────────┤
  │  任务名称          │ 策略      │ 状态   │ 进度  │ 操作   │
  │  ──────────────────────────────────────────────────── │
  │  双均线-回测-1112  │ 双均线   │ 运行中 │ 45%  │ [查看] │
  │  RSI策略-测试      │ RSI策略  │ 完成   │ 100% │ [查看] │
  │  ...                                                   │
  └───────────────────────────────────────────────────────┘
  ```

#### 核心功能
1. **任务列表**
   - 显示所有回测任务（支持分页）
   - 任务状态：等待中、运行中、已完成、失败、已取消
   - 实时进度显示（SSE推送）

2. **筛选器**
   - 按策略筛选（下拉框，可搜索）
   - 按状态筛选
   - 按创建时间筛选
   - 按任务名称搜索

3. **任务卡片信息**
   - 任务名称
   - 关联策略名称 + 版本号
   - 数据集信息（交易对、时间范围）
   - 状态 + 进度条
   - 创建时间 / 完成时间
   - 操作按钮：查看详情、取消（运行中）、删除

#### 优点
- ✅ 统一的任务管理中心
- ✅ 支持跨策略查看所有任务
- ✅ 便于任务对比和管理
- ✅ 符合PRD中的独立任务管理模块设计

#### 缺点
- ❌ 从策略到任务需要两步导航

---

### 方案2：策略详情页 + 回测任务标签页

#### 设计
- **路由**：`/backtesting/strategies/:strategyId`
- **页面布局**：
  ```
  ┌───────────────────────────────────────────────────────┐
  │  双均线策略                            [编辑] [开始回测] │
  ├───────────────────────────────────────────────────────┤
  │  [概览] [脚本版本] [回测任务] [因子配置]               │
  ├───────────────────────────────────────────────────────┤
  │  📊 该策略的回测任务 (共12个)                          │
  │                                                        │
  │  [全部(12)] [运行中(2)] [已完成(8)] [失败(2)]         │
  │  ──────────────────────────────────────────────────── │
  │  任务名称          │ 数据集    │ 状态   │ 操作          │
  │  双均线-回测-1112  │ BTCUSDT  │ 运行中 │ [查看][取消]  │
  │  双均线-回测-1111  │ ETHUSDT  │ 完成   │ [查看]        │
  │  ...                                                   │
  └───────────────────────────────────────────────────────┘
  ```

#### 核心功能
1. **回测任务标签页**
   - 显示当前策略的所有回测任务
   - 按状态分组（Tab切换）
   - 快速操作：查看、取消、删除

2. **任务统计**
   - 显示任务数量统计（总数、各状态数量）
   - 最近回测记录
   - 性能趋势图（可选）

#### 优点
- ✅ 策略和任务紧密关联，上下文清晰
- ✅ 便于对比同一策略的不同回测结果
- ✅ 快速从策略发起回测并查看结果

#### 缺点
- ❌ 无法跨策略查看和对比任务
- ❌ 需要进入策略详情才能看到任务

---

### 方案3：策略列表集成（轻量级）

#### 设计
- **位置**：策略列表页每行添加任务数量徽章
- **交互**：点击徽章弹出任务列表抽屉
  ```
  ┌───────────────────────────────────────────────────────┐
  │  策略管理                                   [+ 创建策略] │
  ├───────────────────────────────────────────────────────┤
  │  策略名称     │ 版本  │ 标签     │ 回测任务  │ 操作     │
  │  ──────────────────────────────────────────────────── │
  │  双均线策略   │ v1.2  │ 经典     │ [12] 🔴2  │ [编辑]   │
  │  RSI策略      │ v2.0  │ 均值回归 │ [8]       │ [编辑]   │
  │  ...                                                   │
  └───────────────────────────────────────────────────────┘
  
  说明：[12] 表示总任务数，🔴2 表示运行中任务数
  点击 [12] 打开任务抽屉
  ```

#### 优点
- ✅ 快速查看策略任务数量
- ✅ 不需要额外导航

#### 缺点
- ❌ 功能有限，不适合详细管理
- ❌ 抽屉形式限制了交互空间

---

## 🎯 推荐方案（混合方案）

### 方案4：独立任务页面 + 策略详情集成（最佳实践 ⭐⭐⭐）

#### 实现方式
1. **主入口**：独立的回测任务管理页面（`/backtesting/tasks`）
   - 顶部导航添加"回测任务"菜单
   - 完整的任务管理功能（筛选、搜索、批量操作）

2. **策略详情页集成**：添加"回测任务"标签页
   - 显示该策略的所有任务
   - 提供"查看全部任务"链接，跳转到任务页面（带策略筛选）

3. **策略列表快捷入口**：添加任务数量徽章
   - 显示任务总数和运行中任务数
   - 点击徽章跳转到任务页面（带策略筛选）
   - 鼠标悬停显示最近3个任务的快捷预览（Tooltip）

#### 页面层级关系
```
顶部导航
├── 策略管理 (/backtesting/strategies)
│   ├── 策略列表
│   │   └── [任务徽章 12 🔴2] → 跳转到任务页面（带策略筛选）
│   └── 策略详情 (/backtesting/strategies/:id)
│       ├── 概览
│       ├── 脚本版本
│       ├── 回测任务 ← 显示该策略的任务
│       └── 因子配置
│
└── 回测任务 (/backtesting/tasks) ← 主入口
    ├── 任务列表（全部任务）
    ├── 筛选器（按策略、状态、时间）
    └── 任务详情 (/backtesting/tasks/:taskId)
```

#### 用户旅程示例
**场景1：查看所有回测任务**
1. 点击顶部导航"回测任务"
2. 看到所有任务列表
3. 使用筛选器按策略/状态筛选
4. 点击任务查看详情

**场景2：从策略查看回测任务**
1. 进入策略管理页
2. 看到策略列表，每个策略显示任务数量徽章 `[12] 🔴2`
3. 点击策略名称进入详情页
4. 切换到"回测任务"标签页
5. 看到该策略的所有任务
6. 或者直接点击徽章跳转到任务页面（自动按该策略筛选）

**场景3：创建任务后查看结果**
1. 在策略列表点击"开始回测"
2. 填写表单创建任务
3. 提交成功后跳转到**任务详情页**（`/backtesting/tasks/:taskId`）
4. 实时查看任务执行进度和日志

---

## 📐 详细设计

### 1. 回测任务管理页面（`/backtesting/tasks`）

#### 1.1 页面布局
```tsx
<PageContainer title="回测任务" extra={<Button type="primary" onClick={handleCreateTask}>创建任务</Button>}>
  {/* 筛选器 */}
  <Card style={{ marginBottom: 16 }}>
    <Space size="large">
      <Input.Search 
        placeholder="搜索任务名称" 
        style={{ width: 300 }}
        onSearch={handleSearch}
      />
      <Select 
        placeholder="选择策略" 
        style={{ width: 200 }}
        showSearch
        allowClear
        onChange={handleStrategyFilter}
      >
        {strategies.map(s => (
          <Select.Option key={s.strategyId} value={s.strategyId}>
            {s.name}
          </Select.Option>
        ))}
      </Select>
      <Select 
        placeholder="任务状态" 
        style={{ width: 150 }}
        allowClear
        onChange={handleStatusFilter}
      >
        <Select.Option value="pending">等待中</Select.Option>
        <Select.Option value="running">运行中</Select.Option>
        <Select.Option value="completed">已完成</Select.Option>
        <Select.Option value="failed">失败</Select.Option>
        <Select.Option value="cancelled">已取消</Select.Option>
      </Select>
      <RangePicker onChange={handleTimeFilter} />
    </Space>
  </Card>

  {/* 任务列表 */}
  <Card>
    <List
      dataSource={tasks}
      renderItem={task => (
        <TaskCard task={task} />
      )}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 个任务`
      }}
    />
  </Card>
</PageContainer>
```

#### 1.2 任务卡片设计
```tsx
const TaskCard = ({ task }) => (
  <List.Item
    actions={[
      <Button type="link" onClick={() => navigate(`/backtesting/tasks/${task.taskId}`)}>
        查看详情
      </Button>,
      task.status === 'running' && (
        <Button type="link" danger onClick={() => handleCancel(task.taskId)}>
          取消
        </Button>
      ),
      ['completed', 'failed', 'cancelled'].includes(task.status) && (
        <Button type="link" danger onClick={() => handleDelete(task.taskId)}>
          删除
        </Button>
      ),
    ].filter(Boolean)}
  >
    <List.Item.Meta
      avatar={<Avatar icon={<RocketOutlined />} />}
      title={
        <Space>
          <Link to={`/backtesting/tasks/${task.taskId}`}>
            {task.taskName}
          </Link>
          {renderStatusTag(task.status)}
        </Space>
      }
      description={
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <Text type="secondary">策略：</Text>
            <Link to={`/backtesting/strategies/${task.strategyId}`}>
              {task.strategyName}
            </Link>
            <Tag>{task.scriptVersionName}</Tag>
          </Space>
          <Space>
            <Text type="secondary">数据集：</Text>
            <Text>{task.datasetName} ({task.tradingPair})</Text>
            <Text type="secondary">时间范围：</Text>
            <Text>{dayjs(task.timeStart).format('YYYY-MM-DD')} ~ {dayjs(task.timeEnd).format('YYYY-MM-DD')}</Text>
          </Space>
          {task.status === 'running' && (
            <Progress percent={task.progress} status="active" />
          )}
          <Space>
            <Text type="secondary">创建时间：</Text>
            <Text>{dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
            {task.completedAt && (
              <>
                <Divider type="vertical" />
                <Text type="secondary">完成时间：</Text>
                <Text>{dayjs(task.completedAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
              </>
            )}
          </Space>
        </Space>
      }
    />
  </List.Item>
);
```

---

### 2. 策略详情页 - 回测任务标签页

#### 2.1 标签页布局
```tsx
<Tabs defaultActiveKey="overview">
  <Tabs.TabPane tab="概览" key="overview">
    {/* 策略基本信息 */}
  </Tabs.TabPane>
  
  <Tabs.TabPane tab="脚本版本" key="versions">
    {/* 版本管理 */}
  </Tabs.TabPane>
  
  <Tabs.TabPane 
    tab={
      <Badge count={runningTasksCount} offset={[10, 0]}>
        回测任务
      </Badge>
    } 
    key="tasks"
  >
    <StrategyTasksTab strategyId={strategyId} />
  </Tabs.TabPane>
  
  <Tabs.TabPane tab="因子配置" key="factors">
    {/* 因子管理 */}
  </Tabs.TabPane>
</Tabs>
```

#### 2.2 回测任务标签页内容
```tsx
const StrategyTasksTab = ({ strategyId }) => {
  const [activeStatus, setActiveStatus] = useState('all');
  const { data: tasks } = useStrategyTasks(strategyId);
  
  const statusCounts = {
    all: tasks.length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  };
  
  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* 统计卡片 */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="总任务数" value={statusCounts.all} />
          </Col>
          <Col span={6}>
            <Statistic title="运行中" value={statusCounts.running} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col span={6}>
            <Statistic title="已完成" value={statusCounts.completed} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={6}>
            <Statistic title="失败" value={statusCounts.failed} valueStyle={{ color: '#ff4d4f' }} />
          </Col>
        </Row>
        
        {/* 状态筛选 */}
        <Radio.Group value={activeStatus} onChange={e => setActiveStatus(e.target.value)}>
          <Radio.Button value="all">全部({statusCounts.all})</Radio.Button>
          <Radio.Button value="running">运行中({statusCounts.running})</Radio.Button>
          <Radio.Button value="completed">已完成({statusCounts.completed})</Radio.Button>
          <Radio.Button value="failed">失败({statusCounts.failed})</Radio.Button>
        </Radio.Group>
        
        {/* 任务列表 */}
        <List
          dataSource={filteredTasks}
          renderItem={task => <TaskCard task={task} />}
        />
        
        {/* 查看全部链接 */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to={`/backtesting/tasks?strategyId=${strategyId}`}>
            查看该策略的全部任务 →
          </Link>
        </div>
      </Space>
    </div>
  );
};
```

---

### 3. 策略列表 - 任务徽章

#### 3.1 策略列表表格列定义
```tsx
const columns = [
  {
    title: '策略名称',
    dataIndex: 'name',
    key: 'name',
    render: (name, record) => (
      <Link to={`/backtesting/strategies/${record.strategyId}`}>
        {name}
      </Link>
    ),
  },
  {
    title: '版本',
    dataIndex: 'masterVersion',
    key: 'version',
    render: (version) => <Tag color="blue">{version?.versionName}</Tag>,
  },
  {
    title: '标签',
    dataIndex: 'tags',
    key: 'tags',
    render: (tags) => tags?.map(tag => <Tag key={tag}>{tag}</Tag>),
  },
  {
    title: '回测任务',
    key: 'tasks',
    render: (_, record) => (
      <TaskBadge 
        strategyId={record.strategyId}
        totalCount={record.tasksCount?.total || 0}
        runningCount={record.tasksCount?.running || 0}
      />
    ),
  },
  {
    title: '操作',
    key: 'actions',
    render: (_, record) => (
      <Space>
        <Button 
          type="link" 
          icon={<EditOutlined />}
          onClick={() => navigate(`/backtesting/strategies/${record.strategyId}`)}
        >
          编辑
        </Button>
        <Button 
          type="link" 
          icon={<RocketOutlined />}
          onClick={() => handleStartBacktest(record)}
        >
          开始回测
        </Button>
      </Space>
    ),
  },
];
```

#### 3.2 任务徽章组件
```tsx
const TaskBadge = ({ strategyId, totalCount, runningCount }) => {
  const [recentTasks, setRecentTasks] = useState([]);
  
  // 鼠标悬停时加载最近任务
  const handleMouseEnter = async () => {
    const tasks = await fetchRecentTasks(strategyId, 3);
    setRecentTasks(tasks);
  };
  
  const tooltipContent = (
    <div style={{ maxWidth: 300 }}>
      <div style={{ marginBottom: 8 }}>
        <strong>最近任务</strong>
      </div>
      {recentTasks.map(task => (
        <div key={task.taskId} style={{ marginBottom: 4 }}>
          <Space size="small">
            {renderStatusTag(task.status)}
            <Text ellipsis style={{ maxWidth: 150 }}>
              {task.taskName}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs(task.createdAt).fromNow()}
            </Text>
          </Space>
        </div>
      ))}
      <Divider style={{ margin: '8px 0' }} />
      <Link to={`/backtesting/tasks?strategyId=${strategyId}`}>
        查看全部 →
      </Link>
    </div>
  );
  
  return (
    <Tooltip 
      title={tooltipContent} 
      onVisibleChange={(visible) => visible && handleMouseEnter()}
    >
      <Space 
        style={{ cursor: 'pointer' }}
        onClick={() => navigate(`/backtesting/tasks?strategyId=${strategyId}`)}
      >
        <Badge count={totalCount} showZero overflowCount={999} style={{ backgroundColor: '#1890ff' }} />
        {runningCount > 0 && (
          <Badge count={runningCount} style={{ backgroundColor: '#52c41a' }} />
        )}
      </Space>
    </Tooltip>
  );
};
```

---

## 🎨 状态标识设计

### 任务状态
```tsx
const renderStatusTag = (status) => {
  const statusConfig = {
    pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
    running: { color: 'processing', text: '运行中', icon: <SyncOutlined spin /> },
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    cancelled: { color: 'warning', text: '已取消', icon: <StopOutlined /> },
  };
  
  const config = statusConfig[status];
  return (
    <Tag color={config.color} icon={config.icon}>
      {config.text}
    </Tag>
  );
};
```

---

## 📊 导航菜单更新

### 顶部导航菜单
```tsx
const menuItems = [
  {
    key: 'strategies',
    label: '策略管理',
    icon: <CodeOutlined />,
    path: '/backtesting/strategies',
  },
  {
    key: 'tasks',
    label: '回测任务',
    icon: <RocketOutlined />,
    path: '/backtesting/tasks',
    badge: runningTasksCount, // 显示运行中任务数
  },
  {
    key: 'datasets',
    label: '数据管理',
    icon: <DatabaseOutlined />,
    path: '/trading-data/datasets',
  },
];
```

---

## ✅ 最终确认方案

### 已确认决策
1. ✅ **主入口**：独立的回测任务管理页面（`/backtesting/tasks`）
2. ✅ **集成入口**：策略详情页下方直接显示回测任务列表（非标签页）
3. ✅ **任务列表筛选**：支持按策略版本筛选
4. ✅ **任务提交后**：跳转到任务详情页（`/backtesting/tasks/:taskId`）
5. ✅ **顶部导航菜单**：不显示运行中任务数量徽章
6. ✅ **策略详情页布局**：
   - 上方：概览、版本号、自定义参数、自定义因子展现说明
   - 下方：回测任务列表

---

**状态**: ✅ 已确认  
**下一步**: 设计回测任务列表和详情页的具体内容

