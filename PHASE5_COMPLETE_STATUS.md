# Phase 5: 前端适配 - 完整状态报告

**更新时间**: 2025-11-27  
**当前进度**: 数据导入页面适配完成 (20%)

---

## ✅ 已完成的任务

### 5.1 数据导入页面适配 ✅ (100%)

#### 完成的工作
1. **类型定义** (`frontend/src/shared/types/asset-types.ts`)
   - ✅ AssetType 枚举
   - ✅ CommissionType 枚举
   - ✅ ContractSpecs 接口
   - ✅ CommissionConfig 接口
   - ✅ 工具常量（ASSET_TYPE_OPTIONS, ASSET_TYPE_LABELS）

2. **API 类型更新** (`frontend/src/shared/api/tradingData.ts`)
   - ✅ ImportTaskDto 添加 assetType 和 contractSpecs
   - ✅ DatasetDto 添加 assetType 和 contractSpecs

3. **创建导入表单** (`CreateImportModal.tsx`)
   - ✅ 资产类型选择下拉框
   - ✅ 期货合约规格配置（合约乘数、保证金比例、最小变动价位）
   - ✅ 股票合约规格配置（最小交易单位）
   - ✅ 动态显示/隐藏逻辑
   - ✅ 表单验证

4. **详情页展示** (`ImportDetailDrawer.tsx`)
   - ✅ 显示资产类型
   - ✅ 显示合约规格
   - ✅ 元数据和数据集部分都展示

5. **列表页展示** (`ImportListPage.tsx`)
   - ✅ 新增"资产类型"列
   - ✅ 使用 Tag 组件显示

#### 测试状态
- ✅ Lint 检查通过
- ✅ TypeScript 编译通过
- ✅ 功能测试通过（导入期货数据）
- ✅ UI/UX 验证通过

---

## ⏳ 待完成的任务

### 5.2 回测任务创建页面适配 ⏳ (0%)

**重要性**: ⭐⭐⭐⭐⭐ (最高)  
**优先级**: P0  
**预计工时**: 4-6 小时

#### 需要修改的文件
- `frontend/src/modules/backtesting/components/CreateBacktestTaskModal.tsx`
- `frontend/src/shared/api/backtestTasks.ts`

#### 需要实现的功能

1. **添加资产类型选择**
   ```tsx
   <Form.Item label="资产类型" name="assetType">
     <Select options={ASSET_TYPE_OPTIONS} />
   </Form.Item>
   ```

2. **添加合约规格配置**（根据资产类型显示）
   - **期货**:
     - 合约乘数 (multiplier)
     - 保证金比例 (marginRatio)
     - 最小变动价位 (tickSize)
   - **股票**:
     - 最小交易单位 (lotSize)

3. **重构佣金配置**
   当前的简单佣金配置：
   ```tsx
   // 旧版本
   <Form.Item label="手续费率" name="fee">
     <InputNumber min={0} max={0.1} step={0.0001} />
   </Form.Item>
   ```
   
   需要改为完整配置：
   ```tsx
   // 新版本
   <Form.Item label="佣金类型" name={['commission', 'type']}>
     <Select options={COMMISSION_TYPE_OPTIONS} />
   </Form.Item>
   
   {/* 根据佣金类型显示不同字段 */}
   {commissionType === 'percentage' && (
     <>
       <Form.Item label="费率" name={['commission', 'rate']}>
         <InputNumber />
       </Form.Item>
       <Form.Item label="最低佣金" name={['commission', 'minCommission']}>
         <InputNumber />
       </Form.Item>
       <Form.Item label="印花税" name={['commission', 'stampDuty']}>
         <InputNumber />
       </Form.Item>
     </>
   )}
   
   {commissionType === 'fixed' && (
     <Form.Item label="固定金额" name={['commission', 'amount']}>
       <InputNumber />
     </Form.Item>
   )}
   
   {commissionType === 'maker-taker' && (
     <>
       <Form.Item label="Maker费率" name={['commission', 'makerRate']}>
         <InputNumber />
       </Form.Item>
       <Form.Item label="Taker费率" name={['commission', 'takerRate']}>
         <InputNumber />
       </Form.Item>
     </>
   )}
   ```

4. **更新 ExecutionConfig 接口**
   ```typescript
   // 旧版本
   export interface ExecutionConfig {
     initialCapital: number;
     leverage: number;
     slippage: number;
     fees: {
       makerFee: number;
       takerFee: number;
     };
   }
   
   // 新版本
   export interface ExecutionConfig {
     initialCapital: number;
     slippage: number;
     assetType: AssetType;
     contractSpecs?: ContractSpecs;
     commission: CommissionConfig;
   }
   ```

5. **数据提交逻辑**
   确保提交的数据结构与后端 DTO 匹配：
   ```typescript
   {
     executionConfig: {
       initialCapital: 100000,
       slippage: 0.0005,
       assetType: 'futures',
       contractSpecs: {
         multiplier: 10,
         marginRatio: 0.09,
         tickSize: 1.0
       },
       commission: {
         type: 'fixed',
         amount: 2.0
       }
     }
   }
   ```

#### UI 设计建议
- 使用 Tabs 或 Collapse 组件组织复杂表单
- 使用 Tooltip 提示每个字段的含义
- 提供常用配置的预设模板（A股、期货、加密货币）

---

### 5.3 回测任务详情页适配 ⏳ (0%)

**重要性**: ⭐⭐⭐⭐  
**优先级**: P1  
**预计工时**: 2-3 小时

#### 需要修改的文件
- `frontend/src/modules/backtesting/components/TaskOverviewTab.tsx`
- `frontend/src/modules/backtesting/components/TaskResultsTab.tsx`

#### 需要实现的功能

1. **显示资产类型**
   ```tsx
   <Descriptions.Item label="资产类型">
     {task.executionConfig.assetType 
       ? ASSET_TYPE_LABELS[task.executionConfig.assetType]
       : '-'}
   </Descriptions.Item>
   ```

2. **显示合约规格**（如果存在）
   ```tsx
   {task.executionConfig.contractSpecs && (
     <Descriptions.Item label="合约规格">
       {task.executionConfig.contractSpecs.multiplier && 
         `合约乘数: ${task.executionConfig.contractSpecs.multiplier}`}
       {task.executionConfig.contractSpecs.marginRatio && 
         `保证金: ${(task.executionConfig.contractSpecs.marginRatio * 100).toFixed(1)}%`}
       {/* ... 其他字段 */}
     </Descriptions.Item>
   )}
   ```

3. **显示完整佣金配置**
   ```tsx
   <Descriptions.Item label="佣金配置">
     {task.executionConfig.commission.type === 'fixed' && 
       `固定佣金: ${task.executionConfig.commission.amount} 元/手`}
     {task.executionConfig.commission.type === 'percentage' && 
       `费率: ${(task.executionConfig.commission.rate * 10000).toFixed(1)}‱`}
     {task.executionConfig.commission.type === 'maker-taker' && 
       `Maker: ${(task.executionConfig.commission.makerRate * 10000).toFixed(1)}‱ / 
        Taker: ${(task.executionConfig.commission.takerRate * 10000).toFixed(1)}‱`}
   </Descriptions.Item>
   ```

4. **移除旧的 leverage 和 fees 字段显示**
   - 删除 leverage 显示
   - 删除 fees.makerFee / fees.takerFee 显示
   - 用新的 commission 配置替代

#### 注意事项
- 需要处理向后兼容（老任务可能没有新字段）
- 格式化显示（保证金百分比、费率万分比）

---

### 5.4 回测任务列表页适配 ⏳ (0%)

**重要性**: ⭐⭐⭐  
**优先级**: P2  
**预计工时**: 1-2 小时

#### 需要修改的文件
- `frontend/src/modules/backtesting/pages/BacktestTaskListPage.tsx`

#### 需要实现的功能

1. **添加资产类型列**（可选）
   ```tsx
   {
     title: '资产类型',
     dataIndex: ['executionConfig', 'assetType'],
     render: (value: string) => value && value in ASSET_TYPE_LABELS ? (
       <Tag color="blue">{ASSET_TYPE_LABELS[value as keyof typeof ASSET_TYPE_LABELS]}</Tag>
     ) : '-',
   }
   ```

2. **添加资产类型筛选**（可选）
   ```tsx
   <Select
     placeholder="资产类型"
     options={[
       { value: 'all', label: '全部' },
       ...ASSET_TYPE_OPTIONS
     ]}
     onChange={(value) => setAssetTypeFilter(value)}
   />
   ```

#### 注意事项
- 列表信息不要过于复杂，只显示关键信息
- 详细配置在详情页查看

---

### 5.5 数据集管理页面适配 ⏳ (0%)

**重要性**: ⭐⭐⭐  
**优先级**: P2  
**预计工时**: 1-2 小时

#### 需要修改的文件
- `frontend/src/modules/trading-data/pages/DatasetListPage.tsx`（如果存在）
- `frontend/src/modules/trading-data/components/DatasetDetailDrawer.tsx`（如果存在）

#### 需要实现的功能

1. **列表页添加资产类型列**
   类似于导入列表页的实现

2. **详情页显示资产类型和合约规格**
   类似于导入详情页的实现

#### 注意事项
- 数据集页面可能与导入页面共用，需要检查是否已实现

---

## 📊 整体进度

| 任务 | 状态 | 进度 | 优先级 | 预计工时 |
|-----|------|------|--------|---------|
| 数据导入页面 | ✅ 完成 | 100% | P0 | 4h |
| 回测任务创建 | ⏳ 待开始 | 0% | P0 | 6h |
| 回测任务详情 | ⏳ 待开始 | 0% | P1 | 3h |
| 回测任务列表 | ⏳ 待开始 | 0% | P2 | 2h |
| 数据集管理 | ⏳ 待开始 | 0% | P2 | 2h |
| **总计** | | **20%** | | **17h** |

---

## 🎯 建议的实施顺序

### 第一阶段（核心功能）
1. ✅ 数据导入页面适配
2. ⏳ **回测任务创建页面适配** ← 当前建议

### 第二阶段（查看功能）
3. ⏳ 回测任务详情页适配
4. ⏳ 回测任务列表页适配

### 第三阶段（完善功能）
5. ⏳ 数据集管理页面适配

---

## 💡 实施建议

### 回测任务创建页面（优先）

**为什么优先**:
- 用户使用频率最高
- 直接影响回测功能
- 复杂度最高，需要更多时间

**实施步骤**:
1. 查看现有的 CreateBacktestTaskModal 组件
2. 了解当前的表单结构和数据流
3. 添加资产类型和合约规格配置
4. 重构佣金配置部分
5. 更新 API 调用
6. 测试各种配置组合

**预期困难**:
- 表单复杂度增加，需要良好的 UI/UX 设计
- 需要处理不同资产类型的条件渲染
- 需要与后端 ExecutionConfigDto 完全匹配

---

## 🔗 相关文档

- Phase 4 完成总结: `/PHASE4_COMPLETED_SUMMARY.md`
- Phase 5 数据导入完成: `/PHASE5_DATA_IMPORT_COMPLETED.md`
- 后端类型定义: `backend/src/backtesting/types/asset-types.ts`
- 前端类型定义: `frontend/src/shared/types/asset-types.ts`

---

## 📝 下一步行动

**推荐**: 开始 **Phase 5.2 - 回测任务创建页面适配**

告诉我："开始 Phase 5.2 - 回测任务创建页面适配"，我将立即开始实施！

---

**Phase 5 完整状态汇总完成！准备好继续实施剩余任务！** 🚀

