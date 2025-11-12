# 回测任务列表和详情页设计

**文档版本**: 1.0  
**创建时间**: 2025-11-12  
**状态**: 🟡 待确认

---

## 📋 目录

1. [回测任务列表设计](#1-回测任务列表设计)
2. [回测任务详情页设计](#2-回测任务详情页设计)

---

## 1. 回测任务列表设计

### 1.1 页面布局（统一使用卡片模式 ✅）

#### 卡片模式设计

**适用场景**：独立任务页面 + 策略详情页下方

**优点**：
- ✅ 视觉层次清晰，易于阅读
- ✅ 可展示更多信息（描述、标签）
- ✅ 适合移动端响应式设计
- ✅ 更美观，信息组织灵活
- ✅ 两个页面保持一致的交互体验

**布局示例**：
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  该策略的回测任务                                                                │
│  版本筛选: [全部版本 ▼]  状态筛选: [全部状态 ▼]  排序: [创建时间 ▼]           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 🚀 双均线策略回测-1112                        [运行中]  创建于 2小时前    │  │
│  │                                                                             │  │
│  │ 📊 基本信息                                                                 │  │
│  │   策略版本: v1.2.0 (Master)    数据集: BTCUSDT 1m                          │  │
│  │   时间范围: 2024-01-01 ~ 2024-12-31    交易周期: 5m                       │  │
│  │                                                                             │  │
│  │ ⚙️ 执行配置                                                                 │  │
│  │   初始资金: $10,000    手续费: Maker 0.02% / Taker 0.05%                  │  │
│  │                                                                             │  │
│  │ 📈 执行进度                                                                 │  │
│  │   ████████████████░░░░░░░░ 45%                                            │  │
│  │   已处理: 236,520 / 525,600 K线    预计剩余: 3小时15分钟                   │  │
│  │                                                                             │  │
│  │                            [查看详情]  [取消任务]                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ ✅ RSI策略回测-性能测试                      [完成]  完成于 1天前          │  │
│  │                                                                             │  │
│  │ 📊 基本信息                                                                 │  │
│  │   策略版本: v2.0.1    数据集: ETHUSDT 5m                                   │  │
│  │   时间范围: 2024-10-01 ~ 2024-12-31    交易周期: 5m                       │  │
│  │                                                                             │  │
│  │ 💰 回测结果                                                                 │  │
│  │   总收益率: +23.5% ↑    最大回撤: -12.3% ↓    夏普比率: 1.85             │  │
│  │   交易次数: 156笔    胜率: 62.8%    盈亏比: 1.45                           │  │
│  │                                                                             │  │
│  │                      [查看详情]  [复制配置]  [删除]                         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 字段详细设计

#### 1.2.1 必选字段

| 字段名 | 数据来源 | 展示格式 | 说明 |
|--------|----------|----------|------|
| **任务ID** | `taskId` | 数字 | 唯一标识 |
| **任务名称** | `taskName` | 文本（最多50字） | 用户自定义 |
| **任务描述** | `taskDescription` | 文本（最多200字） | 可选，卡片模式显示 |
| **策略名称** | `strategy.name` | 文本 + 链接 | 点击跳转到策略详情 |
| **策略版本** | `scriptVersion.versionName` | 标签 | 蓝色标签，显示版本号 |
| **Master标记** | `scriptVersion.isMaster` | 标签 | 绿色"Master"标签 |
| **数据集** | `dataset` | 组合显示 | 交易对、时间周期、时间范围 |
| **任务状态** | `status` | 状态标签 | pending/running/completed/failed/cancelled |
| **执行进度** | `progress` | 进度条 + 百分比 | 仅运行中状态显示 |
| **创建时间** | `createdAt` | 时间戳 | YYYY-MM-DD HH:mm:ss 或相对时间 |
| **完成时间** | `completedAt` | 时间戳 | 仅完成/失败/取消状态显示 |
| **操作按钮** | -- | 按钮组 | 根据状态动态显示 |

#### 1.2.2 可选字段（完成状态）

| 字段名 | 数据来源 | 展示格式 | 说明 |
|--------|----------|----------|------|
| **总收益率** | `result.totalReturn` | 百分比（带颜色） | 绿涨红跌，例如：+23.5% ↑ |
| **最大回撤** | `result.maxDrawdown` | 百分比（红色） | 例如：-12.3% ↓ |
| **夏普比率** | `result.sharpeRatio` | 小数 | 例如：1.85 |
| **交易次数** | `result.totalTrades` | 数字 | 例如：156笔 |
| **胜率** | `result.winRate` | 百分比 | 例如：62.8% |
| **盈亏比** | `result.profitLossRatio` | 比值 | 例如：1.45 |
| **执行耗时** | `completedAt - startedAt` | 时长 | 例如：2小时35分钟 |

#### 1.2.3 可选字段（运行中状态）

| 字段名 | 数据来源 | 展示格式 | 说明 |
|--------|----------|----------|------|
| **已处理K线数** | `progress.processedBars` | 数字 | 例如：236,520 / 525,600 |
| **预计剩余时间** | 计算 | 时长 | 例如：3小时15分钟 |
| **当前处理速度** | 计算 | K线/秒 | 例如：1,250 K线/秒 |

---

### 1.3 筛选器设计

#### 1.3.1 独立任务页面筛选器

```tsx
<Space size="large" wrap>
  {/* 搜索框 */}
  <Input.Search
    placeholder="搜索任务名称或描述"
    style={{ width: 300 }}
    allowClear
    onSearch={handleSearch}
  />
  
  {/* 策略筛选 */}
  <Select
    placeholder="选择策略"
    style={{ width: 200 }}
    showSearch
    allowClear
    filterOption={(input, option) =>
      option?.label?.toLowerCase().includes(input.toLowerCase())
    }
    onChange={handleStrategyFilter}
  >
    {strategies.map(s => (
      <Select.Option key={s.strategyId} value={s.strategyId} label={s.name}>
        {s.name}
      </Select.Option>
    ))}
  </Select>
  
  {/* 版本筛选（联动策略） */}
  <Select
    placeholder="选择版本"
    style={{ width: 150 }}
    allowClear
    disabled={!selectedStrategy}
    onChange={handleVersionFilter}
  >
    <Select.Option value="master">仅Master版本</Select.Option>
    {scriptVersions.map(v => (
      <Select.Option key={v.scriptVersionId} value={v.scriptVersionId}>
        {v.versionName}
      </Select.Option>
    ))}
  </Select>
  
  {/* 状态筛选 */}
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
  
  {/* 时间范围筛选 */}
  <RangePicker
    placeholder={['创建开始时间', '创建结束时间']}
    onChange={handleTimeFilter}
  />
  
  {/* 排序 */}
  <Select
    placeholder="排序方式"
    style={{ width: 150 }}
    defaultValue="createdAt-desc"
    onChange={handleSortChange}
  >
    <Select.Option value="createdAt-desc">创建时间（新→旧）</Select.Option>
    <Select.Option value="createdAt-asc">创建时间（旧→新）</Select.Option>
    <Select.Option value="completedAt-desc">完成时间（新→旧）</Select.Option>
    <Select.Option value="return-desc">收益率（高→低）</Select.Option>
    <Select.Option value="return-asc">收益率（低→高）</Select.Option>
  </Select>
</Space>
```

#### 1.3.2 策略详情页任务列表筛选器

```tsx
<Space size="middle">
  {/* 版本筛选 */}
  <Select
    placeholder="全部版本"
    style={{ width: 180 }}
    allowClear
    onChange={handleVersionFilter}
  >
    <Select.Option value="master">仅Master版本</Select.Option>
    {scriptVersions.map(v => (
      <Select.Option key={v.scriptVersionId} value={v.scriptVersionId}>
        {v.versionName} {v.isMaster && '(Master)'}
      </Select.Option>
    ))}
  </Select>
  
  {/* 状态筛选 */}
  <Radio.Group
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    buttonStyle="solid"
  >
    <Radio.Button value="all">全部({counts.all})</Radio.Button>
    <Radio.Button value="running">运行中({counts.running})</Radio.Button>
    <Radio.Button value="completed">已完成({counts.completed})</Radio.Button>
    <Radio.Button value="failed">失败({counts.failed})</Radio.Button>
  </Radio.Group>
  
  {/* 排序 */}
  <Select
    style={{ width: 150 }}
    defaultValue="createdAt-desc"
    onChange={handleSortChange}
  >
    <Select.Option value="createdAt-desc">最新创建</Select.Option>
    <Select.Option value="completedAt-desc">最新完成</Select.Option>
    <Select.Option value="return-desc">收益率降序</Select.Option>
  </Select>
</Space>
```

---

### 1.4 操作按钮设计

根据任务状态显示不同的操作按钮：

| 状态 | 操作按钮 | 说明 |
|------|---------|------|
| **pending**（等待中） | [查看详情] [取消] | 取消按钮为danger样式 |
| **running**（运行中） | [查看详情] [取消] | 取消需二次确认 |
| **completed**（已完成） | [查看详情] [复制配置] [删除] | 复制配置用于快速创建相似任务 |
| **failed**（失败） | [查看详情] [重试] [删除] | 重试保留原配置 |
| **cancelled**（已取消） | [查看详情] [重新运行] [删除] | 重新运行保留原配置 |

**操作按钮交互**：

```tsx
const renderActions = (task: Task) => {
  const actions = [];
  
  // 查看详情（所有状态）
  actions.push(
    <Button
      type="link"
      icon={<EyeOutlined />}
      onClick={() => navigate(`/backtesting/tasks/${task.taskId}`)}
    >
      查看详情
    </Button>
  );
  
  // 取消（等待中/运行中）
  if (['pending', 'running'].includes(task.status)) {
    actions.push(
      <Popconfirm
        title="确认取消任务？"
        description="取消后将无法恢复任务执行"
        onConfirm={() => handleCancel(task.taskId)}
        okText="确认"
        cancelText="取消"
      >
        <Button type="link" danger icon={<StopOutlined />}>
          取消
        </Button>
      </Popconfirm>
    );
  }
  
  // 复制配置（已完成）
  if (task.status === 'completed') {
    actions.push(
      <Button
        type="link"
        icon={<CopyOutlined />}
        onClick={() => handleCopyConfig(task)}
      >
        复制配置
      </Button>
    );
  }
  
  // 重试（失败）
  if (task.status === 'failed') {
    actions.push(
      <Button
        type="link"
        icon={<RedoOutlined />}
        onClick={() => handleRetry(task.taskId)}
      >
        重试
      </Button>
    );
  }
  
  // 重新运行（已取消）
  if (task.status === 'cancelled') {
    actions.push(
      <Button
        type="link"
        icon={<PlayCircleOutlined />}
        onClick={() => handleRerun(task.taskId)}
      >
        重新运行
      </Button>
    );
  }
  
  // 删除（完成/失败/取消）
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    actions.push(
      <Popconfirm
        title="确认删除任务？"
        description="删除后将无法恢复任务数据和结果"
        onConfirm={() => handleDelete(task.taskId)}
        okText="确认"
        cancelText="取消"
      >
        <Button type="link" danger icon={<DeleteOutlined />}>
          删除
        </Button>
      </Popconfirm>
    );
  }
  
  return actions;
};
```

---

### 1.5 最终方案总结 ✅

#### 独立任务页面（`/backtesting/tasks`）
- **展示方式**：卡片模式
- **信息密度**：中（视觉清晰，便于阅读）
- **筛选器**：完整（策略、版本、状态、时间、排序）
- **分页**：支持分页加载，每页20条

#### 策略详情页下方
- **展示方式**：卡片模式
- **信息密度**：中（与独立页面保持一致）
- **筛选器**：简化（版本、状态、排序）
- **分页**：支持分页加载，每页10条

---

## 2. 回测任务详情页设计

### 2.1 页面布局

#### 整体结构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ← 返回任务列表          双均线策略回测-1112                    [运行中]        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Tab切换:  [📊 概览]  [📈 执行日志]  [💰 回测结果]  [📋 交易明细]             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  (Tab内容区域)                                                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Tab 1: 📊 概览

**显示内容**：任务配置、基本信息、执行概要

#### 2.2.1 任务基本信息卡片

```tsx
<Card title="任务信息" extra={renderStatusTag(task.status)}>
  <Descriptions column={2}>
    <Descriptions.Item label="任务ID">
      {task.taskId}
      <Button 
        type="link" 
        size="small" 
        icon={<CopyOutlined />}
        onClick={() => copyToClipboard(task.taskId)}
      />
    </Descriptions.Item>
    
    <Descriptions.Item label="任务名称">
      {task.taskName}
    </Descriptions.Item>
    
    <Descriptions.Item label="任务描述" span={2}>
      {task.taskDescription || '暂无描述'}
    </Descriptions.Item>
    
    <Descriptions.Item label="创建时间">
      {dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}
    </Descriptions.Item>
    
    <Descriptions.Item label="创建人">
      {task.createdBy || '系统'}
    </Descriptions.Item>
    
    {task.startedAt && (
      <Descriptions.Item label="开始时间">
        {dayjs(task.startedAt).format('YYYY-MM-DD HH:mm:ss')}
      </Descriptions.Item>
    )}
    
    {task.completedAt && (
      <Descriptions.Item label="完成时间">
        {dayjs(task.completedAt).format('YYYY-MM-DD HH:mm:ss')}
      </Descriptions.Item>
    )}
    
    {task.completedAt && task.startedAt && (
      <Descriptions.Item label="执行耗时">
        {formatDuration(dayjs(task.completedAt).diff(task.startedAt))}
      </Descriptions.Item>
    )}
  </Descriptions>
</Card>
```

#### 2.2.2 策略配置卡片

```tsx
<Card title="策略配置">
  <Descriptions column={2}>
    <Descriptions.Item label="策略名称">
      <Link to={`/backtesting/strategies/${task.strategyId}`}>
        {task.strategyName}
      </Link>
    </Descriptions.Item>
    
    <Descriptions.Item label="脚本版本">
      <Space>
        <Tag color="blue">{task.scriptVersion.versionName}</Tag>
        {task.scriptVersion.isMaster && <Tag color="green">Master</Tag>}
      </Space>
    </Descriptions.Item>
    
    <Descriptions.Item label="版本描述" span={2}>
      {task.scriptVersion.description || '暂无描述'}
    </Descriptions.Item>
  </Descriptions>
  
  {/* 策略参数 */}
  {task.strategyParams && Object.keys(task.strategyParams).length > 0 && (
    <>
      <Divider>策略参数</Divider>
      <Descriptions column={3} size="small">
        {Object.entries(task.strategyParams).map(([key, value]) => (
          <Descriptions.Item label={key} key={key}>
            {JSON.stringify(value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </>
  )}
</Card>
```

#### 2.2.3 数据配置卡片

```tsx
<Card title="数据配置">
  <Descriptions column={2}>
    <Descriptions.Item label="数据集">
      {task.dataset.name || task.dataset.description}
    </Descriptions.Item>
    
    <Descriptions.Item label="交易对">
      {task.dataset.tradingPair}
    </Descriptions.Item>
    
    <Descriptions.Item label="数据周期">
      {task.dataset.granularity}
    </Descriptions.Item>
    
    <Descriptions.Item label="交易周期">
      {task.dataConfig.timeframe}
    </Descriptions.Item>
    
    <Descriptions.Item label="回测时间范围" span={2}>
      {dayjs(task.dataConfig.timeRange.start).format('YYYY-MM-DD HH:mm:ss')}
      {' ~ '}
      {dayjs(task.dataConfig.timeRange.end).format('YYYY-MM-DD HH:mm:ss')}
    </Descriptions.Item>
    
    <Descriptions.Item label="数据集范围" span={2}>
      <Text type="secondary">
        {dayjs(task.dataset.timeStart).format('YYYY-MM-DD HH:mm:ss')}
        {' ~ '}
        {dayjs(task.dataset.timeEnd).format('YYYY-MM-DD HH:mm:ss')}
      </Text>
    </Descriptions.Item>
  </Descriptions>
</Card>
```

#### 2.2.4 执行配置卡片

```tsx
<Card title="执行配置">
  <Descriptions column={2}>
    <Descriptions.Item label="初始资金">
      ${task.executionConfig.initialCapital.toLocaleString()}
    </Descriptions.Item>
    
    <Descriptions.Item label="杠杆倍数">
      {task.executionConfig.leverage}x
    </Descriptions.Item>
    
    <Descriptions.Item label="滑点">
      {task.executionConfig.slippage === 0 ? '无滑点' : `${task.executionConfig.slippage * 100}%`}
    </Descriptions.Item>
    
    <Descriptions.Item label="手续费">
      Maker: {(task.executionConfig.fees.makerFee * 100).toFixed(3)}%
      {' / '}
      Taker: {(task.executionConfig.fees.takerFee * 100).toFixed(3)}%
    </Descriptions.Item>
    
    {task.executionConfig.tradingHours && (
      <Descriptions.Item label="交易时段" span={2}>
        {task.executionConfig.tradingHours.start} ~ {task.executionConfig.tradingHours.end}
      </Descriptions.Item>
    )}
  </Descriptions>
</Card>
```

#### 2.2.5 执行进度卡片（运行中状态）

```tsx
{task.status === 'running' && (
  <Card title="执行进度">
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 进度条 */}
      <div>
        <div style={{ marginBottom: 8 }}>
          <Text strong>处理进度</Text>
          <Text style={{ float: 'right' }}>{task.progress.percentage}%</Text>
        </div>
        <Progress 
          percent={task.progress.percentage} 
          status="active"
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
        />
      </div>
      
      {/* 统计信息 */}
      <Row gutter={16}>
        <Col span={6}>
          <Statistic 
            title="已处理K线" 
            value={task.progress.processedBars}
            suffix={`/ ${task.progress.totalBars}`}
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="处理速度" 
            value={task.progress.speed}
            suffix="K线/秒"
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="已执行交易" 
            value={task.progress.tradesCount}
            suffix="笔"
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="预计剩余时间" 
            value={formatDuration(task.progress.estimatedTimeRemaining)}
          />
        </Col>
      </Row>
      
      {/* 操作按钮 */}
      <Space>
        <Button 
          danger 
          icon={<StopOutlined />}
          onClick={handleCancel}
        >
          取消任务
        </Button>
      </Space>
    </Space>
  </Card>
)}
```

#### 2.2.6 错误信息卡片（失败状态）

```tsx
{task.status === 'failed' && task.errorMessage && (
  <Alert
    type="error"
    message="任务执行失败"
    description={
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text>{task.errorMessage}</Text>
        {task.errorStack && (
          <Collapse ghost>
            <Collapse.Panel header="查看详细错误堆栈" key="stack">
              <pre style={{ 
                background: '#f5f5f5', 
                padding: 12, 
                borderRadius: 4,
                overflow: 'auto' 
              }}>
                {task.errorStack}
              </pre>
            </Collapse.Panel>
          </Collapse>
        )}
      </Space>
    }
    action={
      <Button type="primary" icon={<RedoOutlined />} onClick={handleRetry}>
        重试
      </Button>
    }
  />
)}
```

---

### 2.3 Tab 2: 📈 执行日志

**显示内容**：实时日志流、日志筛选、日志导出

#### 2.3.1 日志查看器

```tsx
<Card 
  title="执行日志" 
  extra={
    <Space>
      {/* 日志级别筛选 */}
      <Select
        style={{ width: 120 }}
        placeholder="日志级别"
        allowClear
        onChange={setLogLevelFilter}
      >
        <Select.Option value="debug">DEBUG</Select.Option>
        <Select.Option value="info">INFO</Select.Option>
        <Select.Option value="warn">WARN</Select.Option>
        <Select.Option value="error">ERROR</Select.Option>
      </Select>
      
      {/* 搜索 */}
      <Input.Search
        placeholder="搜索日志"
        style={{ width: 200 }}
        onSearch={setLogSearchKeyword}
      />
      
      {/* 自动滚动 */}
      <Switch
        checkedChildren="自动滚动"
        unCheckedChildren="停止滚动"
        checked={autoScroll}
        onChange={setAutoScroll}
      />
      
      {/* 清空日志 */}
      <Button icon={<ClearOutlined />} onClick={clearLogs}>
        清空
      </Button>
      
      {/* 导出日志 */}
      <Button icon={<DownloadOutlined />} onClick={exportLogs}>
        导出
      </Button>
    </Space>
  }
>
  <div 
    ref={logContainerRef}
    onScroll={handleLogScroll}
    style={{
      height: 600,
      overflow: 'auto',
      background: '#1e1e1e',
      padding: 16,
      borderRadius: 4,
      fontFamily: 'Monaco, Consolas, monospace',
      fontSize: 13,
    }}
  >
    {/* 加载更多提示（顶部） */}
    {hasMoreLogs && (
      <div style={{ textAlign: 'center', padding: 12 }}>
        {isLoadingMore ? (
          <Spin size="small" />
        ) : (
          <Text style={{ color: '#888' }}>向上滚动加载更多日志</Text>
        )}
      </div>
    )}
    
    {filteredLogs.map((log, index) => (
      <div 
        key={log.id || index}
        style={{
          marginBottom: 4,
          color: getLogColor(log.level),
        }}
      >
        <Text style={{ color: '#888', marginRight: 12 }}>
          {dayjs(log.timestamp).format('HH:mm:ss.SSS')}
        </Text>
        <Tag 
          color={getLogLevelColor(log.level)}
          style={{ marginRight: 8, fontSize: 11 }}
        >
          {log.level.toUpperCase()}
        </Tag>
        <Text style={{ color: '#ddd' }}>
          {log.message}
        </Text>
      </div>
    ))}
    
    {logs.length === 0 && (
      <Empty 
        description="暂无日志" 
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ marginTop: 100 }}
      />
    )}
  </div>
</Card>
```

**日志颜色映射**：
```tsx
const getLogColor = (level: string) => {
  const colors = {
    debug: '#666',
    info: '#1890ff',
    warn: '#faad14',
    error: '#ff4d4f',
  };
  return colors[level] || '#ddd';
};

const getLogLevelColor = (level: string) => {
  const colors = {
    debug: 'default',
    info: 'blue',
    warn: 'warning',
    error: 'error',
  };
  return colors[level] || 'default';
};
```

#### 2.3.2 日志下拉加载逻辑 ✅

```tsx
const [logs, setLogs] = useState([]);
const [hasMoreLogs, setHasMoreLogs] = useState(true);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [oldestLogId, setOldestLogId] = useState(null);
const logContainerRef = useRef(null);

// 初始加载最新日志
useEffect(() => {
  loadLatestLogs();
}, [taskId]);

const loadLatestLogs = async () => {
  try {
    const response = await fetch(
      `/api/backtesting/tasks/${taskId}/logs?limit=100`
    );
    const data = await response.json();
    setLogs(data.logs);
    setOldestLogId(data.logs[0]?.id);
    setHasMoreLogs(data.hasMore);
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
};

// 下拉加载更多日志
const handleLogScroll = async (e) => {
  const { scrollTop } = e.target;
  
  // 检测是否滚动到顶部
  if (scrollTop === 0 && hasMoreLogs && !isLoadingMore) {
    setIsLoadingMore(true);
    
    try {
      const response = await fetch(
        `/api/backtesting/tasks/${taskId}/logs?before=${oldestLogId}&limit=100`
      );
      const data = await response.json();
      
      // 在顶部插入新日志
      setLogs(prev => [...data.logs, ...prev]);
      setOldestLogId(data.logs[0]?.id);
      setHasMoreLogs(data.hasMore);
      
      // 保持滚动位置
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = 100;
      }
    } catch (error) {
      console.error('Failed to load more logs:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }
};

// 主动刷新（加载最新日志）
const handleRefreshLogs = async () => {
  setIsRefreshing(true);
  try {
    await loadLatestLogs();
    message.success('日志已刷新');
  } catch (error) {
    message.error('刷新失败');
  } finally {
    setIsRefreshing(false);
  }
};
```

---

### 2.4 Tab 3: 💰 回测结果

**显示内容**：性能指标、图表、回测概要（仅完成状态）

#### 2.4.1 核心指标卡片

```tsx
<Row gutter={16}>
  <Col span={6}>
    <Card>
      <Statistic
        title="总收益率"
        value={result.totalReturn}
        precision={2}
        suffix="%"
        valueStyle={{ 
          color: result.totalReturn >= 0 ? '#3f8600' : '#cf1322' 
        }}
        prefix={result.totalReturn >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="年化收益率"
        value={result.annualizedReturn}
        precision={2}
        suffix="%"
        valueStyle={{ 
          color: result.annualizedReturn >= 0 ? '#3f8600' : '#cf1322' 
        }}
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="最大回撤"
        value={Math.abs(result.maxDrawdown)}
        precision={2}
        suffix="%"
        valueStyle={{ color: '#cf1322' }}
        prefix={<ArrowDownOutlined />}
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="夏普比率"
        value={result.sharpeRatio}
        precision={2}
        valueStyle={{ 
          color: result.sharpeRatio >= 1 ? '#3f8600' : '#999' 
        }}
      />
    </Card>
  </Col>
</Row>

<Row gutter={16} style={{ marginTop: 16 }}>
  <Col span={6}>
    <Card>
      <Statistic
        title="交易次数"
        value={result.totalTrades}
        suffix="笔"
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="胜率"
        value={result.winRate}
        precision={1}
        suffix="%"
        valueStyle={{ 
          color: result.winRate >= 50 ? '#3f8600' : '#999' 
        }}
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="盈亏比"
        value={result.profitLossRatio}
        precision={2}
        valueStyle={{ 
          color: result.profitLossRatio >= 1 ? '#3f8600' : '#999' 
        }}
      />
    </Card>
  </Col>
  
  <Col span={6}>
    <Card>
      <Statistic
        title="最终资金"
        value={result.finalCapital}
        precision={2}
        prefix="$"
      />
    </Card>
  </Col>
</Row>
```

#### 2.4.2 图表区域

```tsx
<Card title="收益曲线" style={{ marginTop: 16 }}>
  <Line
    data={equityCurveData}
    xField="timestamp"
    yField="equity"
    smooth
    color="#1890ff"
    height={300}
    xAxis={{
      type: 'time',
      label: {
        formatter: (v) => dayjs(v).format('MM-DD'),
      },
    }}
    yAxis={{
      label: {
        formatter: (v) => `$${Number(v).toLocaleString()}`,
      },
    }}
    tooltip={{
      formatter: (datum) => ({
        name: '账户权益',
        value: `$${Number(datum.equity).toLocaleString()}`,
      }),
    }}
  />
</Card>

<Card title="回撤曲线" style={{ marginTop: 16 }}>
  <Area
    data={drawdownData}
    xField="timestamp"
    yField="drawdown"
    smooth
    color="#cf1322"
    height={300}
    xAxis={{
      type: 'time',
      label: {
        formatter: (v) => dayjs(v).format('MM-DD'),
      },
    }}
    yAxis={{
      label: {
        formatter: (v) => `${v}%`,
      },
    }}
    tooltip={{
      formatter: (datum) => ({
        name: '回撤',
        value: `${datum.drawdown}%`,
      }),
    }}
  />
</Card>
```

#### 2.4.3 详细指标表格

```tsx
<Card title="详细指标" style={{ marginTop: 16 }}>
  <Descriptions column={3} bordered size="small">
    <Descriptions.Item label="总收益">
      ${result.totalProfit.toLocaleString()}
    </Descriptions.Item>
    <Descriptions.Item label="总亏损">
      ${Math.abs(result.totalLoss).toLocaleString()}
    </Descriptions.Item>
    <Descriptions.Item label="净利润">
      ${result.netProfit.toLocaleString()}
    </Descriptions.Item>
    
    <Descriptions.Item label="盈利交易数">
      {result.winningTrades} 笔
    </Descriptions.Item>
    <Descriptions.Item label="亏损交易数">
      {result.losingTrades} 笔
    </Descriptions.Item>
    <Descriptions.Item label="平均持仓时长">
      {formatDuration(result.avgHoldingPeriod)}
    </Descriptions.Item>
    
    <Descriptions.Item label="最大单笔盈利">
      ${result.maxProfit.toLocaleString()}
    </Descriptions.Item>
    <Descriptions.Item label="最大单笔亏损">
      ${Math.abs(result.maxLoss).toLocaleString()}
    </Descriptions.Item>
    <Descriptions.Item label="平均盈利">
      ${result.avgProfit.toLocaleString()}
    </Descriptions.Item>
    
    <Descriptions.Item label="最大连续盈利">
      {result.maxConsecutiveWins} 笔
    </Descriptions.Item>
    <Descriptions.Item label="最大连续亏损">
      {result.maxConsecutiveLosses} 笔
    </Descriptions.Item>
    <Descriptions.Item label="索提诺比率">
      {result.sortinoRatio.toFixed(2)}
    </Descriptions.Item>
  </Descriptions>
</Card>
```

---

### 2.5 Tab 4: 📋 交易明细

**显示内容**：交易列表、因子筛选、导出功能 ✅

#### 2.5.1 因子筛选器（优先展示 ✅）

```tsx
<Card title="因子筛选" style={{ marginBottom: 16 }}>
  <Form form={filterForm} layout="vertical">
    <Row gutter={16}>
      {/* 系统因子 */}
      <Col span={24}>
        <Divider orientation="left">系统因子</Divider>
      </Col>
      
      <Col span={6}>
        <Form.Item label="交易方向" name="direction">
          <Select allowClear placeholder="全部">
            <Select.Option value="LONG">做多</Select.Option>
            <Select.Option value="SHORT">做空</Select.Option>
          </Select>
        </Form.Item>
      </Col>
      
      <Col span={6}>
        <Form.Item label="盈亏情况" name="profitLoss">
          <Select allowClear placeholder="全部">
            <Select.Option value="profit">盈利</Select.Option>
            <Select.Option value="loss">亏损</Select.Option>
          </Select>
        </Form.Item>
      </Col>
      
      <Col span={6}>
        <Form.Item label="持仓K线数" name="holdingBars">
          <InputNumber.Range 
            style={{ width: '100%' }}
            placeholder={['最小', '最大']}
          />
        </Form.Item>
      </Col>
      
      <Col span={6}>
        <Form.Item label="收益率(%)" name="returnPct">
          <InputNumber.Range 
            style={{ width: '100%' }}
            placeholder={['最小', '最大']}
          />
        </Form.Item>
      </Col>
      
      {/* 自定义因子 */}
      {customFactorsSchema.length > 0 && (
        <>
          <Col span={24}>
            <Divider orientation="left">自定义因子</Divider>
          </Col>
          
          {customFactorsSchema.map(factor => (
            <Col span={6} key={factor.key}>
              <Form.Item label={factor.label} name={['customFactors', factor.key]}>
                {renderFactorFilter(factor)}
              </Form.Item>
            </Col>
          ))}
        </>
      )}
      
      {/* 筛选按钮 */}
      <Col span={24}>
        <Space>
          <Button 
            type="primary" 
            icon={<FilterOutlined />}
            onClick={handleApplyFilter}
          >
            应用筛选
          </Button>
          <Button onClick={handleResetFilter}>
            重置
          </Button>
          <Text type="secondary">
            筛选后: {filteredTrades.length} / {totalTrades} 笔交易
          </Text>
        </Space>
      </Col>
    </Row>
  </Form>
</Card>
```

**因子筛选器渲染逻辑**：

```tsx
const renderFactorFilter = (factor: FactorSchema) => {
  switch (factor.type) {
    case 'number':
    case 'integer':
      return (
        <InputNumber.Range
          style={{ width: '100%' }}
          min={factor.min}
          max={factor.max}
          placeholder={['最小', '最大']}
        />
      );
    
    case 'boolean':
      return (
        <Select allowClear placeholder="全部">
          <Select.Option value={true}>是</Select.Option>
          <Select.Option value={false}>否</Select.Option>
        </Select>
      );
    
    case 'enum':
      return (
        <Select allowClear placeholder="全部" mode="multiple">
          {factor.enumOptions?.map(opt => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      );
    
    case 'string':
      return (
        <Input placeholder="输入关键词" allowClear />
      );
    
    default:
      return <Input allowClear />;
  }
};
```

#### 2.5.2 交易明细表格

```tsx
<Card 
  title="交易明细" 
  extra={
    <Button 
      icon={<DownloadOutlined />}
      onClick={() => exportTrades('csv')}
    >
      导出CSV
    </Button>
  }
>
  <Table
    dataSource={trades}
    columns={[
      {
        title: '交易ID',
        dataIndex: 'tradeId',
        key: 'tradeId',
        width: 80,
      },
      {
        title: '开仓时间',
        dataIndex: 'entryTime',
        key: 'entryTime',
        width: 150,
        render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
        sorter: (a, b) => dayjs(a.entryTime).unix() - dayjs(b.entryTime).unix(),
      },
      {
        title: '平仓时间',
        dataIndex: 'exitTime',
        key: 'exitTime',
        width: 150,
        render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
        sorter: (a, b) => dayjs(a.exitTime).unix() - dayjs(b.exitTime).unix(),
      },
      {
        title: '方向',
        dataIndex: 'direction',
        key: 'direction',
        width: 80,
        render: (direction) => (
          <Tag color={direction === 'LONG' ? 'green' : 'red'}>
            {direction === 'LONG' ? '做多' : '做空'}
          </Tag>
        ),
        filters: [
          { text: '做多', value: 'LONG' },
          { text: '做空', value: 'SHORT' },
        ],
        onFilter: (value, record) => record.direction === value,
      },
      {
        title: '开仓价格',
        dataIndex: 'entryPrice',
        key: 'entryPrice',
        width: 120,
        render: (price) => `$${price.toLocaleString()}`,
        sorter: (a, b) => a.entryPrice - b.entryPrice,
      },
      {
        title: '平仓价格',
        dataIndex: 'exitPrice',
        key: 'exitPrice',
        width: 120,
        render: (price) => `$${price.toLocaleString()}`,
        sorter: (a, b) => a.exitPrice - b.exitPrice,
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 100,
        sorter: (a, b) => a.quantity - b.quantity,
      },
      {
        title: '盈亏',
        dataIndex: 'profitLoss',
        key: 'profitLoss',
        width: 120,
        render: (pl) => (
          <Text style={{ color: pl >= 0 ? '#3f8600' : '#cf1322' }}>
            ${pl.toLocaleString()}
          </Text>
        ),
        sorter: (a, b) => a.profitLoss - b.profitLoss,
      },
      {
        title: '收益率',
        dataIndex: 'returnPct',
        key: 'returnPct',
        width: 100,
        render: (returnPct) => (
          <Text style={{ color: returnPct >= 0 ? '#3f8600' : '#cf1322' }}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
          </Text>
        ),
        sorter: (a, b) => a.returnPct - b.returnPct,
      },
      {
        title: '持仓时长',
        dataIndex: 'holdingPeriod',
        key: 'holdingPeriod',
        width: 120,
        render: (period) => formatDuration(period),
        sorter: (a, b) => a.holdingPeriod - b.holdingPeriod,
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            onClick={() => showTradeDetail(record)}
          >
            查看详情
          </Button>
        ),
      },
    ]}
    scroll={{ x: 1400 }}
    pagination={{
      pageSize: 50,
      showSizeChanger: true,
      showTotal: (total) => `共 ${total} 笔交易`,
    }}
  />
</Card>
```

#### 2.5.3 交易详情抽屉

```tsx
<Drawer
  title={`交易详情 #${selectedTrade?.tradeId}`}
  open={drawerVisible}
  onClose={() => setDrawerVisible(false)}
  width={600}
>
  {selectedTrade && (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 基本信息 */}
      <Card title="基本信息" size="small">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="交易ID">
            {selectedTrade.tradeId}
          </Descriptions.Item>
          <Descriptions.Item label="方向">
            <Tag color={selectedTrade.direction === 'LONG' ? 'green' : 'red'}>
              {selectedTrade.direction === 'LONG' ? '做多' : '做空'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="开仓时间">
            {dayjs(selectedTrade.entryTime).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="平仓时间">
            {dayjs(selectedTrade.exitTime).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="持仓时长">
            {formatDuration(selectedTrade.holdingPeriod)}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      
      {/* 价格信息 */}
      <Card title="价格信息" size="small">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="开仓价格">
            ${selectedTrade.entryPrice.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="平仓价格">
            ${selectedTrade.exitPrice.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="价格变化">
            {((selectedTrade.exitPrice - selectedTrade.entryPrice) / selectedTrade.entryPrice * 100).toFixed(2)}%
          </Descriptions.Item>
          <Descriptions.Item label="数量">
            {selectedTrade.quantity}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      
      {/* 盈亏信息 */}
      <Card title="盈亏信息" size="small">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="盈亏金额">
            <Text style={{ color: selectedTrade.profitLoss >= 0 ? '#3f8600' : '#cf1322' }}>
              ${selectedTrade.profitLoss.toLocaleString()}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="收益率">
            <Text style={{ color: selectedTrade.returnPct >= 0 ? '#3f8600' : '#cf1322' }}>
              {selectedTrade.returnPct >= 0 ? '+' : ''}{selectedTrade.returnPct.toFixed(2)}%
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="手续费">
            ${selectedTrade.fees.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="净盈亏">
            <Text style={{ color: (selectedTrade.profitLoss - selectedTrade.fees) >= 0 ? '#3f8600' : '#cf1322' }}>
              ${(selectedTrade.profitLoss - selectedTrade.fees).toLocaleString()}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      
      {/* 自定义因子 */}
      {selectedTrade.customFactors && Object.keys(selectedTrade.customFactors).length > 0 && (
        <Card title="自定义因子" size="small">
          <Descriptions column={1} size="small">
            {Object.entries(selectedTrade.customFactors).map(([key, value]) => (
              <Descriptions.Item label={key} key={key}>
                {JSON.stringify(value)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}
    </Space>
  )}
</Drawer>
```

---

### 2.6 Tab 5: 📊 交易报表（下一期实现 ⏳）

**位置**：在Tab栏添加"交易报表"入口

```tsx
<Tabs defaultActiveKey="overview">
  <Tabs.TabPane tab="📊 概览" key="overview">
    {/* ... */}
  </Tabs.TabPane>
  
  <Tabs.TabPane tab="📈 执行日志" key="logs">
    {/* ... */}
  </Tabs.TabPane>
  
  <Tabs.TabPane tab="💰 回测结果" key="results">
    {/* ... */}
  </Tabs.TabPane>
  
  <Tabs.TabPane tab="📋 交易明细" key="trades">
    {/* ... */}
  </Tabs.TabPane>
  
  {/* 交易报表（下一期） */}
  <Tabs.TabPane 
    tab={
      <Space>
        📊 交易报表
        <Tag color="orange" style={{ fontSize: 11 }}>敬请期待</Tag>
      </Space>
    } 
    key="reports"
    disabled
  >
    <Empty 
      description="交易报表功能将在下一期实现"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  </Tabs.TabPane>
</Tabs>
```

**规划功能**：
- 多维度交易分析报表
- 因子相关性分析
- 交易热力图
- 时间分布分析
- 持仓周期分析
- 自定义报表模板

---

### 2.7 页面状态管理

不同任务状态下，Tab的可用性：

| Tab | pending | running | completed | failed | cancelled |
|-----|---------|---------|-----------|--------|-----------|
| 📊 概览 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📈 执行日志 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 💰 回测结果 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 📋 交易明细 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 📊 交易报表 | ❌ | ❌ | 🔄 下一期 | ❌ | ❌ |

```tsx
const availableTabs = useMemo(() => {
  const tabs = [
    { key: 'overview', label: '📊 概览', available: true },
    { 
      key: 'logs', 
      label: '📈 执行日志', 
      available: ['running', 'completed', 'failed', 'cancelled'].includes(task.status) 
    },
    { 
      key: 'results', 
      label: '💰 回测结果', 
      available: task.status === 'completed' 
    },
    { 
      key: 'trades', 
      label: '📋 交易明细', 
      available: task.status === 'completed' 
    },
  ];
  
  return tabs.filter(tab => tab.available);
}, [task.status]);
```

---

## 3. 交互设计总结

### 3.1 回测任务列表

#### 独立任务页面
- **展示方式**：表格模式
- **必选字段**：任务ID、任务名称、策略/版本、数据集、状态、操作
- **可选字段**：收益率、最大回撤（完成状态）、进度（运行中）
- **筛选器**：策略、版本、状态、时间范围、排序
- **操作按钮**：查看详情、取消、复制配置、重试、删除

#### 策略详情页
- **展示方式**：卡片模式
- **布局**：上方策略信息，下方任务列表
- **筛选器**：版本、状态、排序
- **扩展信息**：任务描述、执行配置、快速指标

### 3.2 回测任务详情页

#### Tab结构
1. **📊 概览**：任务信息、配置、进度/错误
2. **📈 执行日志**：实时日志流、筛选、导出
3. **💰 回测结果**：性能指标、图表
4. **📋 交易明细**：交易列表、详情、导出

#### 关键特性
- ✅ 实时SSE推送日志和进度
- ✅ 状态相关的Tab可用性控制
- ✅ 丰富的性能指标和图表
- ✅ 交易明细支持排序、筛选、导出
- ✅ 错误信息友好展示和重试机制

---

## ❓ 需要确认的问题

### 1. 任务列表展示
- ❓ 独立任务页面使用**表格模式**，策略详情页使用**卡片模式**，是否合适?
- ❓ 表格模式的字段是否需要增减？
- ❓ 卡片模式显示的信息是否过多或过少？

### 2. 任务详情页
- ❓ Tab的划分是否合理？是否需要合并或拆分？
- ❓ "回测结果"Tab显示的指标是否足够？是否需要更多图表？
- ❓ 交易明细是否需要支持因子筛选？（PRD中提到）

### 3. 实时更新
- ❓ 运行中任务的进度更新频率？（建议每2-5秒）
- ❓ 日志推送的频率和缓冲策略？

### 4. 数据导出
- ❓ 交易明细导出格式是否需要支持Excel？
- ❓ 日志导出是否需要支持时间范围筛选？

---

**请您确认以上设计是否符合预期，有任何需要调整的地方请告诉我！** 🎉

