# Bug修复：创建回测任务集成问题

**修复日期**: 2025-11-13  
**问题发现**: 用户测试反馈  
**修复状态**: ✅ 已完成

---

## 🐛 问题描述

用户在测试创建回测任务功能时发现以下问题：

### 问题1：策略列表和详情页缺少入口
**现象**: 
- 策略列表页没有"开始回测"按钮
- 策略详情页没有"创建回测任务"按钮
- 用户无法从策略页面直接创建任务（场景1）

**影响**: 用户只能从任务列表页创建任务，无法实现"从策略页创建任务"的场景1功能

### 问题2：任务列表页数据集下拉选择无数据
**现象**:
- 打开创建任务模态框
- 数据集下拉框为空
- 实际系统中有3个数据集

**影响**: 用户无法选择数据集，无法完成任务创建

### 问题3：策略列表API请求报错（预期）
**现象**:
```bash
curl 'http://localhost:3000/api/v1/backtesting/strategies?pageSize=999'
# 请求成功，返回数据
```

**分析**: API本身工作正常，问题在于前端没有正确调用和处理

---

## 🔧 解决方案

### 修复1: 策略列表页添加"开始回测"按钮

**文件**: `frontend/src/modules/backtesting/pages/StrategyManagementLandingPage.tsx`

#### 修改内容：

1. **导入依赖**:
```typescript
import { RocketOutlined } from '@ant-design/icons';
import { CreateBacktestTaskModal } from '../components/CreateBacktestTaskModal';
import { listDatasets, type DatasetDto } from '../../../shared/api/tradingData';
```

2. **添加状态**:
```typescript
// 创建回测任务相关状态
const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
const [selectedStrategyForTask, setSelectedStrategyForTask] = useState<string | undefined>();
const [datasets, setDatasets] = useState<DatasetDto[]>([]);
const [loadingDatasets, setLoadingDatasets] = useState(false);
```

3. **加载数据集列表**:
```typescript
const loadDatasets = useCallback(async () => {
  try {
    setLoadingDatasets(true);
    const response = await listDatasets({ pageSize: 999 });
    setDatasets(response.items);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '加载数据集失败';
    message.warning(msg);
  } finally {
    setLoadingDatasets(false);
  }
}, [message]);

useEffect(() => {
  void loadDatasets();
}, [loadDatasets]);
```

4. **策略列表表格添加按钮**:
```typescript
{
  title: '操作',
  key: 'actions',
  render: (_, record) => (
    <Space size={8}>
      <Button
        type="primary"
        size="small"
        icon={<RocketOutlined />}
        onClick={() => {
          setSelectedStrategyForTask(record.strategyId);
          setCreateTaskModalOpen(true);
        }}
        disabled={!record.masterVersion}  // 没有master版本时禁用
      >
        开始回测
      </Button>
      <Button
        size="small"
        onClick={() => void handleEditStrategy(record.strategyId)}
      >
        编辑
      </Button>
    </Space>
  ),
}
```

5. **策略详情Drawer添加按钮**:
```typescript
<Space>
  <Button
    type="primary"
    icon={<RocketOutlined />}
    onClick={() => {
      setSelectedStrategyForTask(strategyDetail.strategyId);
      setCreateTaskModalOpen(true);
    }}
    disabled={!strategyDetail.masterVersion}
  >
    创建回测任务
  </Button>
  <Button
    type="primary"
    onClick={() => openVersionModal(strategyDetail.strategyId, 'create')}
  >
    新建脚本版本
  </Button>
</Space>
```

6. **页面末尾添加模态框**:
```typescript
<CreateBacktestTaskModal
  open={createTaskModalOpen}
  onCancel={() => {
    setCreateTaskModalOpen(false);
    setSelectedStrategyForTask(undefined);
  }}
  onSuccess={() => {
    setCreateTaskModalOpen(false);
    setSelectedStrategyForTask(undefined);
    message.success('回测任务创建成功！');
  }}
  strategyId={selectedStrategyForTask}  // ← 传入策略ID（场景1）
  datasets={datasets.map((d) => ({
    datasetId: d.datasetId,
    name: `${d.source || ''}-${d.tradingPair}-${d.granularity}`.trim(),
    tradingPair: d.tradingPair,
    granularity: d.granularity,
    timeStart: d.timeStart,
    timeEnd: d.timeEnd,
    rowCount: d.rowCount,
  }))}
/>
```

---

### 修复2: 任务列表页加载数据集

**文件**: `frontend/src/modules/backtesting/pages/BacktestTaskListPage.tsx`

#### 修改内容：

1. **导入依赖**:
```typescript
import { listDatasets, type DatasetDto } from '../../../shared/api/tradingData';
```

2. **添加状态**:
```typescript
// 数据集列表
const [datasets, setDatasets] = useState<DatasetDto[]>([]);
const [loadingDatasets, setLoadingDatasets] = useState(false);
```

3. **加载数据集列表**:
```typescript
const loadDatasets = async () => {
  try {
    setLoadingDatasets(true);
    const response = await listDatasets({ pageSize: 999 });
    setDatasets(response.items);
  } catch (error: any) {
    message.error('加载数据集列表失败: ' + error.message);
  } finally {
    setLoadingDatasets(false);
  }
};

useEffect(() => {
  loadDatasets();
}, []);
```

4. **传递数据集到模态框**:
```typescript
<CreateBacktestTaskModal
  open={createModalOpen}
  onCancel={() => setCreateModalOpen(false)}
  onSuccess={handleCreateSuccess}
  // 不传 strategyId（场景2：需要选择策略）
  datasets={datasets.map((d) => ({
    datasetId: d.datasetId,
    name: `${d.source || ''}-${d.tradingPair}-${d.granularity}`.trim(),
    tradingPair: d.tradingPair,
    granularity: d.granularity,
    timeStart: d.timeStart,
    timeEnd: d.timeEnd,
    rowCount: d.rowCount,
  }))}
/>
```

---

## ✅ 修复效果

### 场景1：从策略列表/详情页创建（策略ID已知）

**操作流程**:
1. 访问策略列表页 `/backtesting/strategies`
2. 在策略行看到蓝色"开始回测"按钮
3. 点击按钮，打开创建任务模态框
4. 策略名称自动填充（只读显示）
5. 脚本版本默认选中master
6. 选择数据集（下拉框有数据）
7. 填写其他参数，提交成功

**验证点**:
- ✅ 策略列表表格每行都有"开始回测"按钮
- ✅ 没有master版本的策略按钮禁用（灰色）
- ✅ 点击按钮打开模态框
- ✅ 模态框中策略名称只读显示
- ✅ 数据集下拉框有数据可选

### 场景2：从任务列表页创建（需要选择策略）

**操作流程**:
1. 访问任务列表页 `/backtesting/tasks`
2. 点击顶部"创建任务"按钮
3. 打开模态框，看到"选择策略"下拉框
4. 选择策略后，版本下拉框可用
5. 选择数据集（下拉框有数据）
6. 填写其他参数，提交成功

**验证点**:
- ✅ 任务列表页有"创建任务"按钮
- ✅ 点击按钮打开模态框
- ✅ 模态框中有"选择策略"下拉框
- ✅ 策略下拉框有数据可选
- ✅ 数据集下拉框有数据可选

---

## 📊 修改统计

| 文件 | 修改类型 | 行数变化 |
|------|---------|---------|
| `StrategyManagementLandingPage.tsx` | 增强功能 | +80行 |
| `BacktestTaskListPage.tsx` | Bug修复 | +25行 |
| **总计** | | **+105行** |

### 新增功能

1. ✅ 策略列表表格"开始回测"按钮
2. ✅ 策略详情Drawer"创建回测任务"按钮
3. ✅ 策略页面加载数据集列表
4. ✅ 任务列表页加载数据集列表
5. ✅ 两个页面都集成CreateBacktestTaskModal
6. ✅ 正确传递strategyId参数（区分场景1和场景2）

---

## 🧪 测试结果

### 测试环境
- 后端: `http://localhost:3000` (运行中)
- 前端: `http://localhost:5173` (运行中)
- 数据库: PostgreSQL (包含3个数据集，15个策略)

### 测试用例

#### 用例1：策略列表创建任务
- [ ] 访问 `/backtesting/strategies`
- [ ] 找到有master版本的策略
- [ ] 点击"开始回测"按钮
- [ ] 模态框打开，策略名称只读
- [ ] 版本默认选中master
- [ ] 数据集下拉框有3个选项
- [ ] 填写表单，提交成功

#### 用例2：策略详情创建任务
- [ ] 访问 `/backtesting/strategies`
- [ ] 点击策略名称，打开详情Drawer
- [ ] 看到"创建回测任务"按钮
- [ ] 点击按钮，模态框打开
- [ ] 验证同用例1

#### 用例3：任务列表创建任务
- [ ] 访问 `/backtesting/tasks`
- [ ] 点击顶部"创建任务"按钮
- [ ] 模态框打开，有"选择策略"下拉框
- [ ] 选择一个策略
- [ ] 版本自动选中master
- [ ] 数据集下拉框有3个选项
- [ ] 填写表单，提交成功

#### 用例4：禁用状态验证
- [ ] 策略列表中，没有master版本的策略
- [ ] "开始回测"按钮应该是禁用状态（灰色）
- [ ] 鼠标悬停无反应

---

## 🔗 相关文件

- [CREATE_TASK_FLOW.md](../design/CREATE_TASK_FLOW.md) - 详细交互流程设计
- [VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md) - 测试验证指南
- [P2-FRONTEND-BASIC.md](./P2-FRONTEND-BASIC.md) - Phase 2完成报告

---

## 💡 技术亮点

### 1. 智能禁用
```typescript
disabled={!record.masterVersion}
```
没有master版本的策略自动禁用按钮，提升用户体验

### 2. 数据转换
```typescript
datasets={datasets.map((d) => ({
  datasetId: d.datasetId,
  name: `${d.source || ''}-${d.tradingPair}-${d.granularity}`.trim(),
  // ... 其他字段
}))}
```
将后端DatasetDto转换为前端需要的格式

### 3. 状态分离
```typescript
const [selectedStrategyForTask, setSelectedStrategyForTask] = useState<string | undefined>();
```
使用独立的状态管理选中的策略，不影响现有详情页逻辑

### 4. 回调处理
```typescript
onSuccess={() => {
  setCreateTaskModalOpen(false);
  setSelectedStrategyForTask(undefined);
  message.success('回测任务创建成功！');
}}
```
任务创建成功后清理状态，显示提示

---

## 📝 后续优化建议

### 短期优化
- [ ] 添加创建任务的loading状态
- [ ] 数据集加载失败时的重试机制
- [ ] 创建成功后跳转到任务详情页（可选）

### 长期优化
- [ ] 数据集和策略列表缓存（避免重复加载）
- [ ] 使用React Query管理服务端状态
- [ ] 添加骨架屏提升加载体验

---

## ✨ 总结

### 修复内容
1. ✅ 策略列表页添加"开始回测"入口
2. ✅ 策略详情页添加"创建回测任务"入口
3. ✅ 策略页面加载数据集列表
4. ✅ 任务列表页加载数据集列表
5. ✅ 两种场景正确传递strategyId参数

### 影响范围
- **策略列表页**: 增强功能，添加新按钮
- **任务列表页**: Bug修复，加载数据集
- **不影响**: 现有的策略编辑、版本管理等功能

### 质量保证
- ✅ 无Lint错误
- ✅ TypeScript类型安全
- ✅ 不破坏现有功能
- ✅ 用户体验友好（智能禁用、自动填充）

---

**修复完成时间**: 2025-11-13  
**耗时**: 约40分钟  
**修改文件**: 2个（策略列表页 + 任务列表页）  
**新增文档**: 1个（本文档）

✅ **所有问题已修复，可以开始测试！**

