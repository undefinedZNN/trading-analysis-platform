# 回测参数优化调研报告 - 资产类型与手续费配置

**创建时间**: 2025-11-27  
**版本**: v1.0  
**状态**: 调研完成，待讨论

---

## 📋 目录

1. [调研背景](#调研背景)
2. [当前系统分析](#当前系统分析)
3. [Backtrader佣金机制深度分析](#backtrader佣金机制深度分析)
4. [优化需求分析](#优化需求分析)
5. [业界最佳实践](#业界最佳实践)
6. [优化方案设计](#优化方案设计)
7. [实施建议](#实施建议)

---

## 调研背景

### 需求来源

用户提出了回测任务参数传递的优化需求：

1. **资产类型差异化**
   - 股票和期货的交易参数应该区分
   - 股票：最小手数（lot size）
   - 期货：tick单位、合约乘数（multiplier）、保证金等

2. **手续费模型优化**
   - 支持固定佣金（期货常见）
   - 支持百分比佣金（股票常见）
   - 支持更复杂的手续费结构

### 调研目标

- 分析当前系统的参数传递机制
- 理解Backtrader的佣金和资产类型设计
- 设计向后兼容的优化方案
- 提供清晰的实施路线图

---

## 当前系统分析

### 1. 当前参数传递流程

#### 1.1 前端 → 后端

**文件位置**: `frontend/src/modules/backtesting/components/CreateBacktestTaskModal.tsx`

```typescript
// 前端提交的执行配置
executionConfig: {
  initialCapital: number,
  leverage: number,
  slippage: number,
  fees: {
    makerFee: number,  // Maker手续费率 (0.0002 = 0.02%)
    takerFee: number   // Taker手续费率 (0.0005 = 0.05%)
  }
}
```

#### 1.2 后端 DTO 定义

**文件位置**: `backend/src/backtesting/tasks/dto/create-backtest-task.dto.ts`

```typescript
export class ExecutionConfigDto {
  initialCapital: number;      // 初始资金
  leverage: number = 1;        // 杠杆（MVP固定为1）
  slippage: number = 0;        // 滑点（MVP固定为0）
  fees: FeesDto;               // 手续费配置
  tradingHours?: TradingHoursDto; // 交易时段（可选）
}

export class FeesDto {
  makerFee: number;  // 范围: 0 - 0.01 (0%-1%)
  takerFee: number;  // 范围: 0 - 0.01 (0%-1%)
}
```

#### 1.3 后端 → Worker (RabbitMQ)

**文件位置**: `backend/src/backtesting/tasks/rabbitmq-task-dispatcher.service.ts`

```typescript
// 发送给Worker的任务消息
const taskMessage: TaskMessage = {
  // ... 其他配置
  executionConfig: {
    initialCapital: task.executionConfig.initialCapital || 100000,
    commission: task.executionConfig.fee || 0.001,  // ⚠️ 简化为单一commission
    slippage: task.executionConfig.slippage || 0.0005,
    enableFactors: true,
    factorNames: []
  }
};
```

**❗ 当前问题**: 
- Maker/Taker费率被简化为单一 `commission` 字段
- 没有传递资产类型信息
- 没有传递合约乘数、tick大小等期货参数

#### 1.4 Worker 使用佣金

**文件位置**: `backtest-worker/src/backtrader_integration/execution/backtest_executor.py`

```python
# 当前实现：简单的百分比佣金
commission = task_message['executionConfig'].get('commission', 0.001)
cerebro.broker.setcommission(commission=commission)
```

**❗ 当前问题**:
- 只使用百分比佣金
- 没有区分股票/期货类型
- 没有设置合约乘数等参数

---

### 2. 数据集信息

**文件位置**: `backend/src/trading-data/entities/dataset.entity.ts`

```typescript
@Entity({ name: 'datasets' })
export class DatasetEntity {
  datasetId: number;
  source?: string;              // 数据来源
  tradingPair: string;          // 交易对：BTC/USDT, AAPL
  granularity: string;          // 时间粒度：1m, 5m, 1d
  path: string;                 // 数据路径
  timeStart: Date;
  timeEnd: Date;
  rowCount: number;
  labels: string[];             // 标签
  description?: string;
  // ❌ 缺少：资产类型字段（stock/futures/crypto）
}
```

**❗ 当前问题**:
- 数据集没有明确的 `assetType` 字段
- 无法自动识别股票/期货/加密货币
- 无法存储合约规格信息（tick size, multiplier等）

---

## Backtrader佣金机制深度分析

### 1. CommInfoBase 核心参数

**文件位置**: `backtrader/comminfo.py`

```python
class CommInfoBase(with_metaclass(MetaParams)):
    params = (
        ('commission', 0.0),      # 佣金值（百分比或固定金额）
        ('mult', 1.0),            # 合约乘数（期货）
        ('margin', None),         # 保证金要求
        ('commtype', None),       # COMM_PERC 或 COMM_FIXED
        ('stocklike', False),     # True=股票模式, False=期货模式
        ('percabs', False),       # True: 0.02表示2%, False: 2表示2%
        ('interest', 0.0),        # 做空利息（年化）
        ('interest_long', False), # 是否对多头也收利息
        ('leverage', 1.0),        # 杠杆
        ('automargin', False),    # 自动计算保证金
    )
```

### 2. 股票 vs 期货的关键差异

#### 2.1 股票模式 (`stocklike=True`)

```python
from backtrader.commissions import CommInfo_Stocks_Perc

# 示例：股票百分比佣金
cerebro.broker.addcommissioninfo(
    CommInfo_Stocks_Perc(
        commission=0.001,     # 0.1% 佣金
        stocklike=True,       # 股票模式
        percabs=True,         # 0.001表示0.1%
    )
)

# 特点：
# - 价值计算：value = size * price
# - 现金调整：买入扣除现金，卖出增加现金
# - 做空：会扣除现金
```

#### 2.2 期货模式 (`stocklike=False`)

```python
from backtrader.commissions import CommInfo_Futures_Fixed

# 示例：期货固定佣金
cerebro.broker.addcommissioninfo(
    CommInfo_Futures_Fixed(
        commission=2.0,       # 每手固定2美元
        mult=50,              # 合约乘数50（如E-mini S&P 500）
        margin=5000,          # 保证金5000美元
        stocklike=False,      # 期货模式
        commtype=CommInfoBase.COMM_FIXED
    )
)

# 特点：
# - 价值计算：value = size * price * mult
# - 现金调整：每日结算，浮盈浮亏影响现金
# - 保证金：占用保证金，不扣除全额现金
```

### 3. 佣金类型对比

| 参数 | 股票 (Stocks) | 期货 (Futures) | 加密货币 (Crypto) |
|------|--------------|---------------|------------------|
| `stocklike` | `True` | `False` | `True`（类股票） |
| `commtype` | `COMM_PERC` | `COMM_FIXED` 或 `COMM_PERC` | `COMM_PERC` |
| `mult` | 1.0（不需要） | 合约乘数（如50） | 1.0 |
| `margin` | None | 保证金（如5000） | None（或用于杠杆） |
| `commission` | 0.0002-0.002 | 2.0-5.0（固定）或0.0001（百分比） | 0.0001-0.001 |
| `percabs` | `True` (0.001=0.1%) | `True` | `True` |

### 4. 真实市场示例

#### 4.1 股票 - A股

```python
# A股：佣金万分之3 + 印花税千分之1（卖出）
# 最低佣金5元

# 实现方式1：简化版
cerebro.broker.setcommission(
    commission=0.0003,    # 万分之3
    stocklike=True
)

# 实现方式2：自定义CommInfo（处理最低佣金）
class ChinaStockCommInfo(bt.CommInfoBase):
    params = (
        ('commission', 0.0003),
        ('stamp_duty', 0.001),     # 印花税
        ('min_commission', 5.0),    # 最低佣金
        ('stocklike', True),
    )
    
    def _getcommission(self, size, price, pseudoexec):
        # 买入
        comm = abs(size) * price * self.p.commission
        comm = max(comm, self.p.min_commission)
        
        # 卖出增加印花税
        if size < 0:
            comm += abs(size) * price * self.p.stamp_duty
        
        return comm
```

#### 4.2 期货 - 商品期货

```python
# 示例：螺纹钢期货（rb2401）
# - 合约乘数：10吨/手
# - 保证金比例：10%
# - 手续费：万分之1（按成交金额）

cerebro.broker.addcommissioninfo(
    bt.CommInfoBase(
        commission=0.0001,        # 万分之1
        mult=10,                  # 10吨/手
        margin=0,                 # 用automargin
        automargin=0.1,           # 10%保证金
        stocklike=False,
        commtype=bt.CommInfoBase.COMM_PERC,
        percabs=True
    ),
    name='rb2401'  # 绑定到具体合约
)
```

#### 4.3 加密货币 - 币安现货

```python
# 币安现货：Maker 0.1%, Taker 0.1%
# 没有合约乘数，类似股票

# 问题：Backtrader原生不支持Maker/Taker区分
# 需要自定义或使用平均费率

cerebro.broker.setcommission(
    commission=0.001,    # 0.1%
    stocklike=True       # 类股票模式
)
```

---

## 优化需求分析

### 1. 核心需求

#### 1.1 资产类型支持

| 资产类型 | 需要的参数 | 示例 |
|---------|-----------|------|
| **股票 (Stock)** | • 最小交易单位（lot size）<br>• 佣金率<br>• 最低佣金<br>• 印花税（某些市场） | A股：100股/手，万分之3佣金 |
| **期货 (Futures)** | • 合约乘数（multiplier）<br>• Tick大小（tick size）<br>• 保证金比例<br>• 固定佣金 或 比例佣金 | 螺纹钢：10吨/手，最小变动10元 |
| **加密货币 (Crypto)** | • Maker费率<br>• Taker费率<br>• 最小下单量 | 币安：Maker 0.1%, Taker 0.1% |

#### 1.2 佣金模型支持

```typescript
// 需要支持的佣金模型

// 1. 百分比佣金（股票、加密货币）
{
  type: 'percentage',
  rate: 0.0003,        // 0.03%
  minAmount?: 5.0      // 最低佣金（可选）
}

// 2. 固定佣金（期货常见）
{
  type: 'fixed',
  amount: 2.5          // 每手2.5元
}

// 3. Maker/Taker差异（加密货币）
{
  type: 'maker-taker',
  makerRate: 0.0002,   // Maker 0.02%
  takerRate: 0.0005    // Taker 0.05%
}

// 4. 分段佣金（VIP等级）
{
  type: 'tiered',
  tiers: [
    { volumeFrom: 0, volumeTo: 1000000, rate: 0.001 },
    { volumeFrom: 1000000, volumeTo: Infinity, rate: 0.0005 }
  ]
}
```

---

### 2. 数据模型设计

#### 2.1 数据集元数据扩展

**建议在 `datasets` 表中添加**:

```sql
ALTER TABLE datasets ADD COLUMN asset_type TEXT;  -- 'stock' | 'futures' | 'crypto' | 'forex'
ALTER TABLE datasets ADD COLUMN contract_specs JSONB;  -- 合约规格

-- contract_specs 示例（期货）
{
  "multiplier": 10,          -- 合约乘数
  "tickSize": 1.0,           -- 最小变动价位
  "lotSize": 1,              -- 最小交易单位
  "marginRatio": 0.10,       -- 保证金比例
  "currency": "CNY"          -- 计价货币
}

-- contract_specs 示例（股票）
{
  "lotSize": 100,            -- 最小手数
  "tickSize": 0.01,          -- 最小变动
  "currency": "CNY"
}
```

#### 2.2 ExecutionConfig 扩展

**新的 DTO 设计**:

```typescript
// backend/src/backtesting/tasks/dto/create-backtest-task.dto.ts

export enum AssetType {
  STOCK = 'stock',
  FUTURES = 'futures',
  CRYPTO = 'crypto',
  FOREX = 'forex'
}

export enum CommissionType {
  PERCENTAGE = 'percentage',      // 百分比
  FIXED = 'fixed',                // 固定金额
  MAKER_TAKER = 'maker-taker',    // Maker/Taker差异
  TIERED = 'tiered'               // 分段
}

// 合约规格
export class ContractSpecsDto {
  @ApiPropertyOptional({ description: '合约乘数（期货）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  multiplier?: number;

  @ApiPropertyOptional({ description: '最小变动价位' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tickSize?: number;

  @ApiPropertyOptional({ description: '最小交易单位（手数）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  lotSize?: number;

  @ApiPropertyOptional({ description: '保证金比例（期货）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  marginRatio?: number;

  @ApiPropertyOptional({ description: '计价货币' })
  @IsOptional()
  @IsString()
  currency?: string;
}

// 佣金配置（重构）
export class CommissionConfigDto {
  @ApiProperty({ 
    description: '佣金类型',
    enum: CommissionType
  })
  @IsEnum(CommissionType)
  type!: CommissionType;

  // 百分比佣金
  @ApiPropertyOptional({ description: '佣金率（百分比模式）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  rate?: number;

  // 固定佣金
  @ApiPropertyOptional({ description: '固定佣金金额' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  // Maker/Taker
  @ApiPropertyOptional({ description: 'Maker费率' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  makerRate?: number;

  @ApiPropertyOptional({ description: 'Taker费率' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  takerRate?: number;

  // 最低佣金
  @ApiPropertyOptional({ description: '最低佣金金额' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCommission?: number;

  // 印花税（某些市场）
  @ApiPropertyOptional({ description: '印花税率（仅卖出时收取）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.01)
  stampDuty?: number;
}

// 执行配置（重构）
export class ExecutionConfigDto {
  @ApiProperty({ description: '初始资金' })
  @IsNumber()
  @IsPositive()
  initialCapital!: number;

  @ApiProperty({ description: '资产类型', enum: AssetType })
  @IsEnum(AssetType)
  assetType!: AssetType;

  @ApiPropertyOptional({ description: '合约规格（期货必填）' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractSpecsDto)
  contractSpecs?: ContractSpecsDto;

  @ApiProperty({ description: '佣金配置' })
  @ValidateNested()
  @Type(() => CommissionConfigDto)
  commission!: CommissionConfigDto;

  @ApiPropertyOptional({ description: '滑点' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  slippage?: number;

  @ApiPropertyOptional({ description: '杠杆' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  leverage?: number;
}
```

---

### 3. Worker 实现扩展

**文件位置**: `backtest-worker/src/backtrader_integration/execution/backtest_executor.py`

```python
def _setup_broker(self, cerebro, execution_config):
    """设置Broker（佣金、保证金等）"""
    
    # 1. 设置初始资金
    initial_capital = execution_config['initialCapital']
    cerebro.broker.setcash(initial_capital)
    
    # 2. 获取资产类型和合约规格
    asset_type = execution_config.get('assetType', 'crypto')
    contract_specs = execution_config.get('contractSpecs', {})
    commission_config = execution_config.get('commission', {})
    
    # 3. 根据资产类型配置佣金
    if asset_type == 'stock':
        self._setup_stock_commission(cerebro, commission_config, contract_specs)
    elif asset_type == 'futures':
        self._setup_futures_commission(cerebro, commission_config, contract_specs)
    elif asset_type == 'crypto':
        self._setup_crypto_commission(cerebro, commission_config)
    else:
        raise ValueError(f"Unsupported asset type: {asset_type}")
    
    # 4. 设置滑点
    slippage = execution_config.get('slippage', 0)
    if slippage > 0:
        cerebro.broker.set_slippage_perc(slippage)

def _setup_stock_commission(self, cerebro, commission_config, contract_specs):
    """配置股票佣金"""
    import backtrader as bt
    
    comm_type = commission_config.get('type', 'percentage')
    
    if comm_type == 'percentage':
        # 百分比佣金（支持最低佣金）
        class StockCommInfo(bt.CommInfoBase):
            params = (
                ('commission', commission_config.get('rate', 0.0003)),
                ('min_commission', commission_config.get('minCommission', 0)),
                ('stamp_duty', commission_config.get('stampDuty', 0)),
                ('stocklike', True),
                ('commtype', bt.CommInfoBase.COMM_PERC),
                ('percabs', True),
            )
            
            def _getcommission(self, size, price, pseudoexec):
                # 基础佣金
                comm = abs(size) * price * self.p.commission
                
                # 最低佣金
                if self.p.min_commission > 0:
                    comm = max(comm, self.p.min_commission)
                
                # 卖出时增加印花税
                if size < 0 and self.p.stamp_duty > 0:
                    comm += abs(size) * price * self.p.stamp_duty
                
                return comm
        
        cerebro.broker.addcommissioninfo(StockCommInfo())
    
    # 设置最小交易单位
    lot_size = contract_specs.get('lotSize', 1)
    if lot_size > 1:
        # TODO: 实现lot size限制（可能需要在策略层面处理）
        pass

def _setup_futures_commission(self, cerebro, commission_config, contract_specs):
    """配置期货佣金"""
    import backtrader as bt
    
    # 合约规格
    multiplier = contract_specs.get('multiplier', 1)
    margin_ratio = contract_specs.get('marginRatio', 0.1)
    
    comm_type = commission_config.get('type', 'fixed')
    
    if comm_type == 'fixed':
        # 固定佣金（每手）
        cerebro.broker.setcommission(
            commission=commission_config.get('amount', 2.0),
            mult=multiplier,
            margin=None,
            automargin=margin_ratio,
            stocklike=False,
            commtype=bt.CommInfoBase.COMM_FIXED
        )
    elif comm_type == 'percentage':
        # 百分比佣金
        cerebro.broker.setcommission(
            commission=commission_config.get('rate', 0.0001),
            mult=multiplier,
            margin=None,
            automargin=margin_ratio,
            stocklike=False,
            commtype=bt.CommInfoBase.COMM_PERC,
            percabs=True
        )

def _setup_crypto_commission(self, cerebro, commission_config):
    """配置加密货币佣金"""
    import backtrader as bt
    
    comm_type = commission_config.get('type', 'maker-taker')
    
    if comm_type == 'maker-taker':
        # Maker/Taker费率
        # 注意：Backtrader原生不支持，使用平均费率近似
        maker_rate = commission_config.get('makerRate', 0.0002)
        taker_rate = commission_config.get('takerRate', 0.0005)
        avg_rate = (maker_rate + taker_rate) / 2
        
        cerebro.broker.setcommission(
            commission=avg_rate,
            stocklike=True,
            commtype=bt.CommInfoBase.COMM_PERC,
            percabs=True
        )
        
        # TODO: 考虑实现自定义CommInfo来精确区分Maker/Taker
    elif comm_type == 'percentage':
        cerebro.broker.setcommission(
            commission=commission_config.get('rate', 0.001),
            stocklike=True,
            commtype=bt.CommInfoBase.COMM_PERC,
            percabs=True
        )
```

---

## 业界最佳实践

### 1. QuantConnect

```csharp
// 设置资产类型和佣金模型
Securities[symbol].FeeModel = new ConstantFeeModel(1.0m);  // 固定佣金
Securities[symbol].FeeModel = new InteractiveBrokersFeeModel();  // IB佣金模型
Securities[symbol].MarginModel = new FutureMarginModel();  // 期货保证金
```

### 2. Backtrader Pro

```python
# 商业版支持更复杂的佣金模型
cerebro.broker.addcommissioninfo(
    bt.CommInfoPro(
        commission_type='maker-taker',
        maker_fee=0.0002,
        taker_fee=0.0005,
        min_commission=0.1
    )
)
```

### 3. VeighNa (原vnpy)

```python
# 中国市场特化
from vnpy.trader.object import ContractData

contract = ContractData(
    symbol="rb2401",
    exchange=Exchange.SHFE,
    product=Product.FUTURES,
    size=10,                    # 合约乘数
    pricetick=1,                # 最小变动价位
    min_volume=1,               # 最小下单量
)
```

---

## 优化方案设计

### 方案一：渐进式优化（推荐）

**优点**: 
- 向后兼容
- 分阶段实施，降低风险
- 易于测试和验证

**实施步骤**:

#### Phase 1: 数据模型扩展（2-3天）

1. **数据库迁移**
   ```sql
   -- 添加资产类型字段
   ALTER TABLE datasets ADD COLUMN asset_type TEXT DEFAULT 'crypto';
   ALTER TABLE datasets ADD COLUMN contract_specs JSONB;
   
   -- 创建索引
   CREATE INDEX idx_datasets_asset_type ON datasets(asset_type);
   ```

2. **Entity 更新**
   ```typescript
   // backend/src/trading-data/entities/dataset.entity.ts
   @Column({ name: 'asset_type', type: 'text', default: 'crypto' })
   assetType!: string;
   
   @Column({ name: 'contract_specs', type: 'jsonb', nullable: true })
   contractSpecs?: ContractSpecs;
   ```

3. **向后兼容**: 现有数据自动设置为 `crypto` 类型

#### Phase 2: DTO 和 API 扩展（3-4天）

1. **新建类型定义**
   - `AssetType` 枚举
   - `ContractSpecsDto` 类
   - `CommissionConfigDto` 类（向后兼容旧的 `FeesDto`）

2. **ExecutionConfig 重构**
   ```typescript
   export class ExecutionConfigDto {
     // 保留旧字段（向后兼容）
     @ApiPropertyOptional({ deprecated: true })
     @IsOptional()
     fees?: FeesDto;
     
     // 新字段
     @ApiPropertyOptional()
     @IsOptional()
     assetType?: AssetType;
     
     @ApiPropertyOptional()
     @IsOptional()
     commission?: CommissionConfigDto;
     
     @ApiPropertyOptional()
     @IsOptional()
     contractSpecs?: ContractSpecsDto;
   }
   ```

3. **兼容性处理**
   ```typescript
   // 如果提供了旧的fees，自动转换为新的commission
   if (dto.fees && !dto.commission) {
     dto.commission = {
       type: CommissionType.MAKER_TAKER,
       makerRate: dto.fees.makerFee,
       takerRate: dto.fees.takerFee
     };
   }
   ```

#### Phase 3: Worker 实现（4-5天）

1. **创建 CommissionManager**
   ```python
   # backtest-worker/src/backtrader_integration/commission/commission_manager.py
   
   class CommissionManager:
       def setup_broker(self, cerebro, execution_config):
           """统一的broker配置入口"""
           pass
   ```

2. **实现各资产类型的佣金处理**

3. **单元测试**
   - 股票佣金计算测试
   - 期货佣金计算测试
   - 加密货币佣金计算测试

#### Phase 4: 前端适配（3-4天）

1. **创建任务时选择资产类型**
   ```tsx
   <Form.Item label="资产类型" name="assetType">
     <Select>
       <Option value="stock">股票</Option>
       <Option value="futures">期货</Option>
       <Option value="crypto">加密货币</Option>
     </Select>
   </Form.Item>
   ```

2. **动态表单**: 根据资产类型显示不同的配置项

3. **前端校验**: 期货必须填写合约规格

#### Phase 5: 集成测试和文档（2-3天）

1. **端到端测试**
2. **性能测试**
3. **文档更新**
4. **示例策略**

**总计**: 14-19 个工作日

---

### 方案二：一次性重构（不推荐）

**缺点**:
- 破坏性变更
- 需要同时更新所有组件
- 测试周期长
- 风险高

---

## 实施建议

### 1. 优先级排序

#### P0 - 必须实现
- ✅ 资产类型枚举（stock/futures/crypto）
- ✅ 百分比佣金 vs 固定佣金
- ✅ 期货合约乘数
- ✅ 期货保证金比例

#### P1 - 重要但可延后
- 🔶 Maker/Taker 差异化（当前用平均值）
- 🔶 最低佣金限制
- 🔶 印花税支持

#### P2 - 可选
- 🔷 分段佣金（VIP等级）
- 🔷 Tick size 限制
- 🔷 Lot size 限制

### 2. 向后兼容策略

```typescript
// Migration 逻辑
function migrateExecutionConfig(oldConfig: any): ExecutionConfigDto {
  // 如果是旧格式
  if (oldConfig.fees && !oldConfig.commission) {
    return {
      ...oldConfig,
      assetType: AssetType.CRYPTO,  // 默认为加密货币
      commission: {
        type: CommissionType.MAKER_TAKER,
        makerRate: oldConfig.fees.makerFee,
        takerRate: oldConfig.fees.takerFee
      }
    };
  }
  
  return oldConfig;
}
```

### 3. 测试策略

#### 单元测试
```python
# backtest-worker/tests/test_commission_manager.py

def test_stock_commission():
    """测试股票佣金计算"""
    config = {
        'assetType': 'stock',
        'commission': {
            'type': 'percentage',
            'rate': 0.0003,
            'minCommission': 5.0
        }
    }
    # 测试小额交易（触发最低佣金）
    # 测试大额交易
    pass

def test_futures_commission():
    """测试期货佣金计算"""
    config = {
        'assetType': 'futures',
        'contractSpecs': {
            'multiplier': 10,
            'marginRatio': 0.1
        },
        'commission': {
            'type': 'fixed',
            'amount': 2.0
        }
    }
    # 测试保证金计算
    # 测试盈亏计算
    pass
```

#### 集成测试
- 创建不同资产类型的回测任务
- 验证佣金计算是否正确
- 验证结果一致性

### 4. 文档要求

#### 用户文档
- 📄 各资产类型参数说明
- 📄 佣金配置指南
- 📄 示例配置（A股、期货、币安）

#### 开发文档
- 📄 API 变更说明
- 📄 数据库迁移指南
- 📄 Worker 扩展指南

---

## 附录

### A. 真实市场参数参考

#### A.1 中国A股
```json
{
  "assetType": "stock",
  "contractSpecs": {
    "lotSize": 100,
    "tickSize": 0.01,
    "currency": "CNY"
  },
  "commission": {
    "type": "percentage",
    "rate": 0.0003,
    "minCommission": 5.0,
    "stampDuty": 0.001
  }
}
```

#### A.2 中国商品期货（螺纹钢）
```json
{
  "assetType": "futures",
  "contractSpecs": {
    "multiplier": 10,
    "tickSize": 1.0,
    "marginRatio": 0.09,
    "currency": "CNY"
  },
  "commission": {
    "type": "percentage",
    "rate": 0.0001
  }
}
```

#### A.3 币安现货
```json
{
  "assetType": "crypto",
  "commission": {
    "type": "maker-taker",
    "makerRate": 0.001,
    "takerRate": 0.001
  }
}
```

#### A.4 E-mini S&P 500 (ES)
```json
{
  "assetType": "futures",
  "contractSpecs": {
    "multiplier": 50,
    "tickSize": 0.25,
    "marginRatio": 0.06,
    "currency": "USD"
  },
  "commission": {
    "type": "fixed",
    "amount": 1.24
  }
}
```

### B. Backtrader 完整示例

```python
import backtrader as bt

# 股票策略
cerebro = bt.Cerebro()
cerebro.broker.setcash(100000)

# A股佣金设置
class ChinaStockCommInfo(bt.CommInfoBase):
    params = (
        ('commission', 0.0003),
        ('min_commission', 5.0),
        ('stamp_duty', 0.001),
        ('stocklike', True),
        ('commtype', bt.CommInfoBase.COMM_PERC),
        ('percabs', True),
    )
    
    def _getcommission(self, size, price, pseudoexec):
        comm = abs(size) * price * self.p.commission
        comm = max(comm, self.p.min_commission)
        if size < 0:
            comm += abs(size) * price * self.p.stamp_duty
        return comm

cerebro.broker.addcommissioninfo(ChinaStockCommInfo())

# 期货策略
cerebro_futures = bt.Cerebro()
cerebro_futures.broker.setcash(100000)

# 螺纹钢期货
cerebro_futures.broker.setcommission(
    commission=0.0001,
    mult=10,
    margin=None,
    automargin=0.09,
    stocklike=False,
    commtype=bt.CommInfoBase.COMM_PERC,
    percabs=True
)
```

---

## 总结

### 关键要点

1. **当前问题明确**: 系统缺少资产类型区分和灵活的佣金配置

2. **Backtrader 支持完善**: 底层引擎已支持各种佣金模型，需要在上层做好参数传递

3. **渐进式优化可行**: 可以在保持向后兼容的前提下逐步实现

4. **工作量可控**: 预计 14-19 个工作日完成

### 下一步行动

1. **确认需求**: 与用户确认资产类型优先级（股票/期货/加密货币）

2. **确定方案**: 选择渐进式优化还是一次性重构

3. **制定时间表**: 根据团队资源安排实施计划

4. **启动开发**: 从 Phase 1（数据模型扩展）开始

---

**报告完成时间**: 2025-11-27  
**文档维护**: 随方案实施持续更新

