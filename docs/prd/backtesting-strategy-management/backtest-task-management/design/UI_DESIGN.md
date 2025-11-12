# 回测任务管理 - UI设计文档

**版本**: 1.0  
**最后更新**: 2025-11-12  
**状态**: ✅ 已确认

本文档整合了创建任务流程、任务列表和任务详情页的所有UI设计。

---

## 📑 目录

1. [创建回测任务](#1-创建回测任务)
2. [回测任务列表](#2-回测任务列表)
3. [回测任务详情页](#3-回测任务详情页)

---

## 1. 创建回测任务

### 1.1 入口设计
- **位置**: 策略列表每行"开始回测"按钮
- **触发方式**: 弹窗表单（Modal，800px宽度）

### 1.2 表单结构

详细设计请参考原文档：
- [CREATE_TASK_FLOW.md](../CREATE_TASK_FLOW.md) - 完整的创建任务流程设计

**核心要点**:
- 4个步骤：基本信息、数据配置、交易配置、策略参数
- 默认master版本，可切换
- 时间范围默认使用数据集全部时间
- MVP不实现：杠杆倍数UI、滑点设置UI
- 提交后跳转到任务详情页

---

## 2. 回测任务列表

### 2.1 展示方式
**统一使用卡片模式** ✅

- 独立任务页面（`/backtesting/tasks`）：卡片模式
- 策略详情页下方：卡片模式

### 2.2 卡片设计

详细设计请参考原文档：
- [TASK_LIST_DETAIL_DESIGN.md](../TASK_LIST_DETAIL_DESIGN.md) - 第1章

**运行中任务卡片**:
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

**完成任务卡片**:
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

**独立任务页面**:
- 搜索框、策略筛选、**版本筛选**、状态筛选、时间范围、排序

**策略详情页**:
- **版本筛选**、状态筛选（Radio）、排序

---

## 3. 回测任务详情页

### 3.1 页面结构

```
┌─────────────────────────────────────────────┐
│ ← 返回  任务名称              [状态标签]     │
├─────────────────────────────────────────────┤
│ [📊概览] [📈日志] [💰结果] [📋明细] [📊报表]│
├─────────────────────────────────────────────┤
│ (Tab内容区域)                                │
└─────────────────────────────────────────────┘
```

### 3.2 Tab设计

详细设计请参考原文档：
- [TASK_LIST_DETAIL_DESIGN.md](../TASK_LIST_DETAIL_DESIGN.md) - 第2章

#### Tab 1: 📊 概览
- 任务基本信息
- 策略配置（含参数）
- 数据配置
- 执行配置
- **执行进度**（运行中，1分钟刷新 + 主动刷新按钮）
- **错误信息**（失败状态）

#### Tab 2: 📈 执行日志
- 日志查看器（黑色终端风格）
- **下拉加载更多**（非实时推送）
- 日志级别筛选、关键词搜索
- 主动刷新按钮
- ❌ 不支持导出

#### Tab 3: 💰 回测结果
- 核心指标卡片（8个）
- 图表（收益曲线、回撤曲线）
- 详细指标表格

#### Tab 4: 📋 交易明细
- ✅ **因子筛选器**（系统因子 + 自定义因子）
- 交易明细表格
- 交易详情抽屉
- ✅ **CSV导出**

#### Tab 5: 📊 交易报表
- 下一期实现
- 显示入口（禁用状态，标记"敬请期待"）

### 3.3 Tab可用性

| Tab | pending | running | completed | failed | cancelled |
|-----|---------|---------|-----------|--------|-----------|
| 概览 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 执行日志 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 回测结果 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 交易明细 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 交易报表 | ❌ | ❌ | 🔄 | ❌ | ❌ |

---

## 4. 交互规范

### 4.1 状态标识

```tsx
const StatusTag = {
  pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', text: '运行中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  cancelled: { color: 'warning', text: '已取消', icon: <StopOutlined /> },
};
```

### 4.2 操作按钮

| 状态 | 操作 |
|------|------|
| **pending** | 查看详情、取消 |
| **running** | 查看详情、取消 |
| **completed** | 查看详情、复制配置、删除 |
| **failed** | 查看详情、重试、删除 |
| **cancelled** | 查看详情、重新运行、删除 |

### 4.3 数据格式化

```tsx
// 收益率
const formatReturn = (value: number) => {
  const color = value >= 0 ? '#3f8600' : '#cf1322';
  const symbol = value >= 0 ? '+' : '';
  return <Text style={{ color }}>{symbol}{value.toFixed(2)}%</Text>;
};

// 时长
const formatDuration = (ms: number) => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}小时${minutes}分钟`;
};

// 金额
const formatCurrency = (value: number) => {
  return `$${value.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
};
```

---

## 5. 响应式设计

### 5.1 断点
- **Desktop**: ≥ 1200px（标准布局）
- **Tablet**: 768px - 1199px（卡片2列）
- **Mobile**: < 768px（卡片1列，简化筛选器）

### 5.2 适配策略
- 卡片布局自适应列数
- 筛选器在移动端折叠为抽屉
- 表格在移动端可横向滚动
- 图表自适应容器宽度

---

## 6. 性能优化

### 6.1 列表虚拟化
- 任务列表超过50条时启用虚拟滚动
- 使用 `react-window` 或 `react-virtualized`

### 6.2 图表懒加载
- 图表组件按需加载（动态import）
- 使用 `React.lazy` + `Suspense`

### 6.3 数据缓存
- 使用 SWR 或 React Query 管理服务端状态
- 列表数据缓存5分钟
- 详情数据缓存1分钟（运行中任务）

---

## 7. 无障碍支持

### 7.1 键盘导航
- 卡片可通过Tab键聚焦
- 筛选器支持键盘操作
- 弹窗支持Esc关闭

### 7.2 屏幕阅读器
- 状态标签包含aria-label
- 进度条包含aria-valuenow
- 表格包含完整的aria标签

---

## 8. 设计资产

### 8.1 颜色规范
- **Primary**: #1890ff（蓝色）
- **Success**: #52c41a（绿色）
- **Warning**: #faad14（橙色）
- **Error**: #ff4d4f（红色）
- **Info**: #1890ff（蓝色）

### 8.2 间距规范
- **Base**: 8px
- **Small**: 4px
- **Medium**: 12px
- **Large**: 16px
- **XLarge**: 24px

### 8.3 字体规范
- **Title**: 20px, 500
- **Subtitle**: 16px, 500
- **Body**: 14px, 400
- **Caption**: 12px, 400
- **Code**: Monaco, Consolas, monospace, 13px

---

## 9. 组件库

使用 **Ant Design** 作为基础组件库。

### 9.1 核心组件
- Modal - 弹窗
- Card - 卡片
- Table - 表格
- Form - 表单
- Select - 下拉框
- DatePicker - 日期选择
- Progress - 进度条
- Tag - 标签
- Badge - 徽章
- Collapse - 折叠面板
- Drawer - 抽屉
- Empty - 空状态

### 9.2 图表库
- **@ant-design/plots** 或 **recharts**
- 折线图（收益曲线）
- 面积图（回撤曲线）

---

## 10. 相关文档

### 原始设计文档
- [CREATE_TASK_FLOW.md](../CREATE_TASK_FLOW.md) - 创建任务流程
- [TASK_VIEW_DESIGN.md](../TASK_VIEW_DESIGN.md) - 任务查看入口
- [TASK_LIST_DETAIL_DESIGN.md](../TASK_LIST_DETAIL_DESIGN.md) - 列表和详情页

### 技术文档
- [数据库设计](./DATABASE_DESIGN.md)
- [API设计](./API_DESIGN.md)

---

**维护者**: Frontend Team  
**最后更新**: 2025-11-12

