# 回测参数优化 - 详细实施TODO

**创建时间**: 2025-11-27  
**版本**: v1.0  
**状态**: 待实施

---

## 📋 决策记录

基于与用户的讨论，确定以下实施决策：

- ✅ **资产类型优先级**: 先实现期货和股票，暂不考虑加密货币
- ✅ **向后兼容**: 不需要，直接破坏性更新，清理历史数据
- ✅ **Maker/Taker**: 实现精确区分（自定义CommInfo）
- ✅ **数据集迁移**: 清理历史数据，不需要迁移逻辑

**优势**: 
- 实施更简单直接
- 代码更清晰，无历史包袱
- 工期可缩短至 10-14 个工作日

---

## 🎯 整体目标

### Phase 1: 数据模型扩展（2天）
扩展数据库和Entity，支持资产类型和合约规格

### Phase 2: 类型定义和DTO（2-3天）
创建新的类型系统和DTO，移除旧的fees字段

### Phase 3: 后端集成（2天）
更新后端服务，正确传递参数到Worker

### Phase 4: Worker实现（3-4天）
实现CommissionManager，支持股票和期货的精确配置

### Phase 5: 前端适配（2-3天）
创建资产类型选择和动态配置表单

### Phase 6: 测试和文档（1-2天）
完整的测试和文档

**总工期**: 12-16 个工作日

---

## Phase 1: 数据模型扩展（2天）

### 1.1 数据库迁移脚本
**文件**: `backend/src/migrations/YYYYMMDDHHMMSS-add-asset-type-and-contract-specs.ts`

**任务**:
```typescript
// 创建迁移文件
- [ ] 创建 migration 文件
- [ ] 添加 asset_type 列（枚举类型）
- [ ] 添加 contract_specs 列（JSONB）
- [ ] 创建索引：idx_datasets_asset_type
- [ ] 添加注释说明
- [ ] 测试 up() 方法
- [ ] 测试 down() 方法（回滚）
```

**代码骨架**:
```typescript
import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddAssetTypeAndContractSpecs1732700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 添加 asset_type 列
    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'asset_type',
        type: 'text',
        isNullable: false,
        comment: '资产类型：stock（股票）、futures（期货）、crypto（加密货币）、forex（外汇）'
      })
    );

    // 2. 添加 contract_specs 列
    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'contract_specs',
        type: 'jsonb',
        isNullable: true,
        comment: '合约规格（期货必填）：multiplier（合约乘数）、tickSize（最小变动价位）、marginRatio（保证金比例）等'
      })
    );

    // 3. 创建索引
    await queryRunner.createIndex(
      'datasets',
      new TableIndex({
        name: 'idx_datasets_asset_type',
        columnNames: ['asset_type']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('datasets', 'idx_datasets_asset_type');
    await queryRunner.dropColumn('datasets', 'contract_specs');
    await queryRunner.dropColumn('datasets', 'asset_type');
  }
}
```

**验收标准**:
- [ ] 迁移脚本运行成功
- [ ] 数据库中存在 asset_type 列
- [ ] 数据库中存在 contract_specs 列
- [ ] 索引创建成功
- [ ] 回滚测试成功

**预估工时**: 2小时

---

### 1.2 Entity 更新
**文件**: `backend/src/trading-data/entities/dataset.entity.ts`

**任务**:
```typescript
- [ ] 添加 assetType 字段
- [ ] 添加 contractSpecs 字段
- [ ] 创建 ContractSpecs 接口
- [ ] 更新 TypeORM 装饰器
- [ ] 添加字段注释
```

**代码实现**:
```typescript
// 1. 创建合约规格接口
export interface ContractSpecs {
  // 期货参数
  multiplier?: number;      // 合约乘数
  tickSize?: number;        // 最小变动价位
  marginRatio?: number;     // 保证金比例
  
  // 股票参数
  lotSize?: number;         // 最小交易单位（手）
  
  // 通用参数
  currency?: string;        // 计价货币
}

// 2. 更新 Entity
@Entity({ name: 'datasets', orderBy: { createdAt: 'DESC' } })
export class DatasetEntity extends BaseAuditEntity {
  // ... 现有字段 ...
  
  @Column({
    type: 'text',
    name: 'asset_type',
    nullable: false,
    comment: '资产类型：stock, futures, crypto, forex',
  })
  assetType!: string;

  @Column({
    type: 'jsonb',
    name: 'contract_specs',
    nullable: true,
    comment: '合约规格信息',
  })
  contractSpecs?: ContractSpecs;
}
```

**验收标准**:
- [ ] Entity 编译通过
- [ ] TypeORM 能正确映射新字段
- [ ] 可以保存和查询 assetType
- [ ] 可以保存和查询 contractSpecs（JSONB）

**预估工时**: 1小时

---

### 1.3 清理历史数据
**任务**:
```bash
- [ ] 备份当前数据库
- [ ] 删除 backtest_tasks 表的所有记录
- [ ] 删除 datasets 表的所有记录
- [ ] 验证数据清理完成
- [ ] 运行迁移脚本
```

**SQL脚本**:
```sql
-- 备份（可选）
-- pg_dump -U postgres -d trading_platform > backup_before_cleanup.sql

-- 清理数据
TRUNCATE TABLE backtest_tasks CASCADE;
TRUNCATE TABLE datasets CASCADE;

-- 验证
SELECT COUNT(*) FROM backtest_tasks;  -- 应该为 0
SELECT COUNT(*) FROM datasets;        -- 应该为 0
```

**验收标准**:
- [ ] 所有历史数据已清理
- [ ] 迁移脚本运行成功
- [ ] 数据库结构正确

**预估工时**: 0.5小时

---

### 1.4 更新数据导入服务
**文件**: `backend/src/trading-data/dto/create-dataset.dto.ts`

**任务**:
```typescript
- [ ] 在 CreateDatasetDto 中添加 assetType 字段
- [ ] 添加 contractSpecs 字段
- [ ] 添加校验规则
- [ ] 更新 API 文档
```

**代码实现**:
```typescript
import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AssetType {
  STOCK = 'stock',
  FUTURES = 'futures',
  CRYPTO = 'crypto',
  FOREX = 'forex'
}

export class CreateDatasetDto {
  // ... 现有字段 ...

  @ApiProperty({
    description: '资产类型',
    enum: AssetType,
    example: AssetType.FUTURES
  })
  @IsEnum(AssetType)
  assetType!: AssetType;

  @ApiPropertyOptional({
    description: '合约规格（期货必填）',
    example: {
      multiplier: 10,
      tickSize: 1.0,
      marginRatio: 0.09,
      currency: 'CNY'
    }
  })
  @IsOptional()
  @IsObject()
  contractSpecs?: Record<string, any>;
}
```

**验收标准**:
- [ ] DTO 编译通过
- [ ] Swagger 文档正确显示
- [ ] 验证规则生效

**预估工时**: 1小时

---

## Phase 2: 类型定义和DTO（2-3天）

### 2.1 创建共享类型定义
**文件**: `backend/src/backtesting/types/asset-types.ts`

**任务**:
```typescript
- [ ] 创建 AssetType 枚举
- [ ] 创建 CommissionType 枚举
- [ ] 创建 ContractSpecsDto 类
- [ ] 创建 CommissionConfigDto 类
- [ ] 添加完整的JSDoc注释
```

**代码实现**:
```typescript
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 资产类型枚举
 */
export enum AssetType {
  /** 股票 */
  STOCK = 'stock',
  /** 期货 */
  FUTURES = 'futures',
  /** 加密货币 */
  CRYPTO = 'crypto',
  /** 外汇 */
  FOREX = 'forex',
}

/**
 * 佣金类型枚举
 */
export enum CommissionType {
  /** 百分比佣金（股票常用） */
  PERCENTAGE = 'percentage',
  /** 固定金额佣金（期货常用） */
  FIXED = 'fixed',
  /** Maker/Taker差异（加密货币） */
  MAKER_TAKER = 'maker-taker',
  /** 分段佣金（VIP等级） */
  TIERED = 'tiered',
}

/**
 * 合约规格 DTO
 */
export class ContractSpecsDto {
  @ApiPropertyOptional({
    description: '合约乘数（期货）',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  multiplier?: number;

  @ApiPropertyOptional({
    description: '最小变动价位',
    example: 1.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tickSize?: number;

  @ApiPropertyOptional({
    description: '最小交易单位（手数）',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  lotSize?: number;

  @ApiPropertyOptional({
    description: '保证金比例（期货）',
    example: 0.09,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  marginRatio?: number;

  @ApiPropertyOptional({
    description: '计价货币',
    example: 'CNY',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}

/**
 * 佣金配置 DTO
 */
export class CommissionConfigDto {
  @ApiProperty({
    description: '佣金类型',
    enum: CommissionType,
    example: CommissionType.FIXED,
  })
  @IsEnum(CommissionType)
  type!: CommissionType;

  @ApiPropertyOptional({
    description: '佣金率（百分比模式）',
    example: 0.0003,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  rate?: number;

  @ApiPropertyOptional({
    description: '固定佣金金额（固定模式）',
    example: 2.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Maker费率（Maker-Taker模式）',
    example: 0.0002,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  makerRate?: number;

  @ApiPropertyOptional({
    description: 'Taker费率（Maker-Taker模式）',
    example: 0.0005,
    minimum: 0,
    maximum: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  takerRate?: number;

  @ApiPropertyOptional({
    description: '最低佣金金额',
    example: 5.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCommission?: number;

  @ApiPropertyOptional({
    description: '印花税率（某些市场，仅卖出时收取）',
    example: 0.001,
    minimum: 0,
    maximum: 0.01,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.01)
  stampDuty?: number;
}
```

**验收标准**:
- [ ] 所有类型编译通过
- [ ] JSDoc 注释完整
- [ ] 验证规则正确
- [ ] Swagger 能正确显示

**预估工时**: 3小时

---

### 2.2 重构 ExecutionConfigDto
**文件**: `backend/src/backtesting/tasks/dto/create-backtest-task.dto.ts`

**任务**:
```typescript
- [ ] 移除旧的 FeesDto 类
- [ ] 重构 ExecutionConfigDto
- [ ] 添加 assetType 字段（必填）
- [ ] 添加 contractSpecs 字段（期货必填）
- [ ] 添加 commission 字段（使用新的 CommissionConfigDto）
- [ ] 移除 leverage 字段（暂不支持）
- [ ] 添加自定义验证器（期货必须有合约规格）
```

**代码实现**:
```typescript
import { ValidateIf, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';
import { AssetType, CommissionConfigDto, ContractSpecsDto } from '../types/asset-types';

// 自定义验证器：期货必须有合约规格
export function IsRequiredForFutures(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isRequiredForFutures',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          if (obj.assetType === AssetType.FUTURES) {
            return value !== undefined && value !== null;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} is required when assetType is 'futures'`;
        },
      },
    });
  };
}

/**
 * 执行配置 DTO
 */
export class ExecutionConfigDto {
  @ApiProperty({
    description: '初始资金',
    example: 100000,
    minimum: 1,
    maximum: 10000000,
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(10000000)
  initialCapital!: number;

  @ApiProperty({
    description: '资产类型',
    enum: AssetType,
    example: AssetType.FUTURES,
  })
  @IsEnum(AssetType)
  assetType!: AssetType;

  @ApiPropertyOptional({
    description: '合约规格（期货必填，股票可选）',
    type: ContractSpecsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractSpecsDto)
  @IsRequiredForFutures({ message: '期货必须提供合约规格' })
  contractSpecs?: ContractSpecsDto;

  @ApiProperty({
    description: '佣金配置',
    type: CommissionConfigDto,
  })
  @ValidateNested()
  @Type(() => CommissionConfigDto)
  commission!: CommissionConfigDto;

  @ApiPropertyOptional({
    description: '滑点',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  slippage?: number;
}
```

**验收标准**:
- [ ] ExecutionConfigDto 编译通过
- [ ] 旧的 fees 字段已移除
- [ ] 自定义验证器生效（期货必须有合约规格）
- [ ] Swagger 文档正确
- [ ] 单元测试通过

**预估工时**: 3小时

---

### 2.3 更新前端类型定义
**文件**: `frontend/src/shared/api/backtestTasks.ts`

**任务**:
```typescript
- [ ] 添加 AssetType 枚举
- [ ] 添加 CommissionType 枚举
- [ ] 创建 ContractSpecs 接口
- [ ] 创建 CommissionConfig 接口
- [ ] 更新 ExecutionConfig 接口
- [ ] 移除旧的 FeesConfig 接口
```

**代码实现**:
```typescript
/**
 * 资产类型
 */
export enum AssetType {
  STOCK = 'stock',
  FUTURES = 'futures',
  CRYPTO = 'crypto',
  FOREX = 'forex',
}

/**
 * 佣金类型
 */
export enum CommissionType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  MAKER_TAKER = 'maker-taker',
  TIERED = 'tiered',
}

/**
 * 合约规格
 */
export interface ContractSpecs {
  multiplier?: number;      // 合约乘数
  tickSize?: number;        // 最小变动价位
  lotSize?: number;         // 最小交易单位
  marginRatio?: number;     // 保证金比例
  currency?: string;        // 计价货币
}

/**
 * 佣金配置
 */
export interface CommissionConfig {
  type: CommissionType;
  rate?: number;            // 百分比佣金率
  amount?: number;          // 固定佣金金额
  makerRate?: number;       // Maker费率
  takerRate?: number;       // Taker费率
  minCommission?: number;   // 最低佣金
  stampDuty?: number;       // 印花税
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  initialCapital: number;
  assetType: AssetType;
  contractSpecs?: ContractSpecs;
  commission: CommissionConfig;
  slippage?: number;
}
```

**验收标准**:
- [ ] TypeScript 编译通过
- [ ] 前端可以正确使用新类型
- [ ] 旧的 FeesConfig 已移除

**预估工时**: 1小时

---

## Phase 3: 后端集成（2天）

### 3.1 更新 RabbitMQ 消息接口
**文件**: `backend/src/backtesting/rabbitmq/rabbitmq-publisher.service.ts`

**任务**:
```typescript
- [ ] 更新 TaskMessage 接口
- [ ] 在 executionConfig 中添加完整的资产类型信息
- [ ] 移除简化的 commission 字段
- [ ] 传递完整的 CommissionConfig
```

**代码实现**:
```typescript
import { AssetType, CommissionConfigDto, ContractSpecsDto } from '../tasks/types/asset-types';

/**
 * 任务消息接口
 */
export interface TaskMessage {
  taskId: string;
  strategyId: string;
  scriptVersionId: string;
  userId?: string;
  priority?: number;
  
  strategyCode: string;
  strategyClassName: string;
  strategyParameters: Record<string, any>;
  
  dataConfig: {
    datasetId: number;
    datasetPath: string;
    tradingPair: string;
    granularity: string;
    assetType: AssetType;          // 新增：资产类型
    contractSpecs?: ContractSpecs; // 新增：合约规格
    startDate?: string;
    endDate?: string;
    timeframe?: string;
  };
  
  executionConfig: {
    initialCapital: number;
    assetType: AssetType;           // 新增：资产类型
    contractSpecs?: ContractSpecs;  // 新增：合约规格
    commission: CommissionConfig;   // 重构：完整的佣金配置
    slippage?: number;
    enableFactors?: boolean;
    factorNames?: string[];
  };
  
  timeoutConfig?: {
    idleTimeout?: number;
    absoluteMaxTime?: number;
  };
  
  createdAt: string;
}

// 类型别名（便于使用）
type CommissionConfig = CommissionConfigDto;
type ContractSpecs = ContractSpecsDto;
```

**验收标准**:
- [ ] TaskMessage 接口更新完成
- [ ] TypeScript 编译通过
- [ ] 所有引用处更新

**预估工时**: 1小时

---

### 3.2 更新任务分发服务
**文件**: `backend/src/backtesting/tasks/rabbitmq-task-dispatcher.service.ts`

**任务**:
```typescript
- [ ] 更新 dispatchTask 方法
- [ ] 从 dataset 获取 assetType 和 contractSpecs
- [ ] 传递完整的 commission 配置
- [ ] 移除简化逻辑
- [ ] 添加日志
```

**代码实现**:
```typescript
async dispatchTask(task: BacktestTaskEntity): Promise<boolean> {
  try {
    // 1. 加载脚本版本
    const scriptVersion = await this.strategiesService.getScriptVersion(
      task.scriptVersionId
    );

    // 2. 加载数据集
    const dataset = await this.tradingDataService.getDatasetById(task.datasetId);
    
    if (!dataset) {
      throw new Error(`Dataset ${task.datasetId} not found`);
    }

    // 3. 验证资产类型匹配
    if (task.executionConfig.assetType !== dataset.assetType) {
      this.logger.warn(
        `Asset type mismatch: task=${task.executionConfig.assetType}, dataset=${dataset.assetType}`
      );
    }

    // 4. 构建任务消息
    const taskMessage: TaskMessage = {
      taskId: task.taskId,
      strategyId: task.strategyId,
      scriptVersionId: task.scriptVersionId,
      userId: task.createdBy,
      priority: 5,
      
      strategyCode: scriptVersion.code || '',
      strategyClassName: 'Strategy',
      strategyParameters: task.strategyParams || {},
      
      dataConfig: {
        datasetId: dataset.datasetId,
        datasetPath: dataset.path || '',
        tradingPair: dataset.tradingPair,
        granularity: dataset.granularity,
        assetType: dataset.assetType,              // 新增
        contractSpecs: dataset.contractSpecs,      // 新增
        startDate: task.dataConfig?.timeRange?.start,
        endDate: task.dataConfig?.timeRange?.end,
        timeframe: (task.dataConfig as any)?.timeframe,
      },
      
      executionConfig: {
        initialCapital: task.executionConfig.initialCapital,
        assetType: task.executionConfig.assetType,        // 新增
        contractSpecs: task.executionConfig.contractSpecs, // 新增
        commission: task.executionConfig.commission,       // 完整配置
        slippage: task.executionConfig.slippage || 0,
        enableFactors: true,
        factorNames: [],
      },
      
      timeoutConfig: {
        idleTimeout: 600,
        absoluteMaxTime: undefined,
      },
      
      createdAt: task.createdAt.toISOString(),
    };

    // 5. 发布任务
    const published = await this.publisherService.publishTask(taskMessage);

    if (published) {
      this.logger.log(
        `Task ${task.taskId} dispatched: assetType=${task.executionConfig.assetType}`
      );
      return true;
    } else {
      this.logger.error(`Failed to dispatch task ${task.taskId}`);
      return false;
    }

  } catch (error) {
    this.logger.error(
      `Error dispatching task ${task.taskId}: ${error.message}`
    );
    throw error;
  }
}
```

**验收标准**:
- [ ] dispatchTask 方法更新完成
- [ ] 完整传递资产类型信息
- [ ] 完整传递佣金配置
- [ ] 日志输出正确
- [ ] 编译通过

**预估工时**: 2小时

---

### 3.3 更新 Entity
**文件**: `backend/src/backtesting/tasks/entities/backtest-task.entity.ts`

**任务**:
```typescript
- [ ] 更新 ExecutionConfig 接口
- [ ] 移除旧的 fees 字段
- [ ] 添加新的字段
- [ ] 更新注释
```

**代码实现**:
```typescript
import { AssetType, CommissionConfigDto, ContractSpecsDto } from '../types/asset-types';

/**
 * 执行配置接口
 */
export interface ExecutionConfig {
  initialCapital: number;
  assetType: AssetType;
  contractSpecs?: ContractSpecsDto;
  commission: CommissionConfigDto;
  slippage?: number;
}
```

**验收标准**:
- [ ] Entity 接口更新完成
- [ ] TypeORM 正确处理
- [ ] 可以保存和查询

**预估工时**: 1小时

---

## Phase 4: Worker实现（3-4天）

### 4.1 创建 CommissionManager
**文件**: `backtest-worker/src/backtrader_integration/commission/commission_manager.py`

**任务**:
```python
- [ ] 创建 commission 包
- [ ] 创建 CommissionManager 类
- [ ] 实现 setup_broker() 主方法
- [ ] 实现 _setup_stock_commission()
- [ ] 实现 _setup_futures_commission()
- [ ] 添加完整的日志
- [ ] 添加错误处理
```

**代码骨架**:
```python
"""
佣金管理器

负责根据资产类型和佣金配置，正确设置Backtrader的Broker佣金。
"""
import logging
import backtrader as bt
from typing import Dict, Any

logger = logging.getLogger(__name__)


class CommissionManager:
    """佣金管理器"""
    
    def setup_broker(self, cerebro: bt.Cerebro, execution_config: Dict[str, Any]) -> None:
        """
        根据配置设置Broker佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置，包含 assetType, commission, contractSpecs
        """
        asset_type = execution_config.get('assetType')
        
        if not asset_type:
            raise ValueError("Missing required field: assetType")
        
        logger.info(f"Setting up broker for asset type: {asset_type}")
        
        # 1. 设置初始资金
        initial_capital = execution_config['initialCapital']
        cerebro.broker.setcash(initial_capital)
        logger.info(f"Initial capital: {initial_capital}")
        
        # 2. 根据资产类型配置佣金
        if asset_type == 'stock':
            self._setup_stock_commission(cerebro, execution_config)
        elif asset_type == 'futures':
            self._setup_futures_commission(cerebro, execution_config)
        else:
            raise ValueError(f"Unsupported asset type: {asset_type}")
        
        # 3. 设置滑点
        slippage = execution_config.get('slippage', 0)
        if slippage > 0:
            cerebro.broker.set_slippage_perc(slippage)
            logger.info(f"Slippage set to: {slippage}")
    
    def _setup_stock_commission(
        self, 
        cerebro: bt.Cerebro, 
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置股票佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config['commission']
        contract_specs = execution_config.get('contractSpecs', {})
        
        comm_type = commission_config['type']
        
        logger.info(f"Setting up stock commission, type: {comm_type}")
        
        if comm_type == 'percentage':
            # 百分比佣金（支持最低佣金和印花税）
            self._setup_stock_percentage_commission(
                cerebro, 
                commission_config
            )
        else:
            raise ValueError(f"Unsupported commission type for stock: {comm_type}")
    
    def _setup_futures_commission(
        self, 
        cerebro: bt.Cerebro, 
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置期货佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config['commission']
        contract_specs = execution_config.get('contractSpecs', {})
        
        if not contract_specs:
            raise ValueError("Futures requires contractSpecs")
        
        # 提取合约规格
        multiplier = contract_specs.get('multiplier', 1)
        margin_ratio = contract_specs.get('marginRatio', 0.1)
        
        comm_type = commission_config['type']
        
        logger.info(
            f"Setting up futures commission, type: {comm_type}, "
            f"multiplier: {multiplier}, margin: {margin_ratio}"
        )
        
        if comm_type == 'fixed':
            # 固定佣金
            amount = commission_config['amount']
            cerebro.broker.setcommission(
                commission=amount,
                mult=multiplier,
                margin=None,
                automargin=margin_ratio,
                stocklike=False,
                commtype=bt.CommInfoBase.COMM_FIXED
            )
            logger.info(f"Fixed commission set: {amount} per contract")
            
        elif comm_type == 'percentage':
            # 百分比佣金
            rate = commission_config['rate']
            cerebro.broker.setcommission(
                commission=rate,
                mult=multiplier,
                margin=None,
                automargin=margin_ratio,
                stocklike=False,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"Percentage commission set: {rate * 100}%")
        else:
            raise ValueError(f"Unsupported commission type for futures: {comm_type}")
    
    def _setup_stock_percentage_commission(
        self,
        cerebro: bt.Cerebro,
        commission_config: Dict[str, Any]
    ) -> None:
        """
        配置股票百分比佣金（支持最低佣金和印花税）
        
        Args:
            cerebro: Backtrader Cerebro 实例
            commission_config: 佣金配置
        """
        rate = commission_config.get('rate', 0.0003)
        min_commission = commission_config.get('minCommission', 0)
        stamp_duty = commission_config.get('stampDuty', 0)
        
        # 如果有最低佣金或印花税，需要自定义 CommInfo
        if min_commission > 0 or stamp_duty > 0:
            class StockCommInfo(bt.CommInfoBase):
                params = (
                    ('commission', rate),
                    ('min_commission', min_commission),
                    ('stamp_duty', stamp_duty),
                    ('stocklike', True),
                    ('commtype', bt.CommInfoBase.COMM_PERC),
                    ('percabs', True),
                )
                
                def _getcommission(self, size, price, pseudoexec):
                    """计算佣金"""
                    # 基础佣金
                    comm = abs(size) * price * self.p.commission
                    
                    # 最低佣金
                    if self.p.min_commission > 0:
                        comm = max(comm, self.p.min_commission)
                    
                    # 印花税（仅卖出）
                    if size < 0 and self.p.stamp_duty > 0:
                        comm += abs(size) * price * self.p.stamp_duty
                    
                    return comm
            
            cerebro.broker.addcommissioninfo(StockCommInfo())
            
            logger.info(
                f"Stock commission set: rate={rate * 100}%, "
                f"min={min_commission}, stamp_duty={stamp_duty * 100}%"
            )
        else:
            # 简单百分比佣金
            cerebro.broker.setcommission(
                commission=rate,
                stocklike=True,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"Stock commission set: {rate * 100}%")
```

**验收标准**:
- [ ] CommissionManager 类实现完成
- [ ] 支持股票百分比佣金
- [ ] 支持最低佣金
- [ ] 支持印花税
- [ ] 支持期货固定佣金
- [ ] 支持期货百分比佣金
- [ ] 支持合约乘数
- [ ] 支持保证金比例
- [ ] 日志输出完整
- [ ] 错误处理完善

**预估工时**: 6小时

---

### 4.2 实现 Maker/Taker 精确区分
**文件**: `backtest-worker/src/backtrader_integration/commission/maker_taker_commission.py`

**任务**:
```python
- [ ] 创建 MakerTakerCommInfo 类
- [ ] 继承 bt.CommInfoBase
- [ ] Hook 订单类型判断
- [ ] 实现 _getcommission 方法
- [ ] 区分 Limit 订单（Maker）和 Market 订单（Taker）
- [ ] 添加详细注释
```

**代码实现**:
```python
"""
Maker/Taker 佣金支持

Backtrader 原生不支持 Maker/Taker 区分，这里通过自定义 CommInfo 实现。

判断逻辑：
- Limit 订单 → Maker（提供流动性）
- Market 订单 → Taker（消耗流动性）
- Stop 订单 → Taker（触发后变为 Market）
"""
import backtrader as bt
import logging

logger = logging.getLogger(__name__)


class MakerTakerCommInfo(bt.CommInfoBase):
    """
    支持 Maker/Taker 差异化费率的佣金类
    
    注意：这是一个近似实现，因为 Backtrader 在 _getcommission 时
    无法直接访问订单类型。我们通过一些启发式方法来判断。
    """
    
    params = (
        ('maker_rate', 0.0002),    # Maker 费率
        ('taker_rate', 0.0005),    # Taker 费率
        ('stocklike', True),       # 类股票模式
        ('commtype', bt.CommInfoBase.COMM_PERC),
        ('percabs', True),
    )
    
    def __init__(self):
        super().__init__()
        self._order_type_cache = {}  # 缓存订单类型
        logger.info(
            f"MakerTakerCommInfo initialized: "
            f"maker={self.p.maker_rate}, taker={self.p.taker_rate}"
        )
    
    def _getcommission(self, size, price, pseudoexec):
        """
        计算佣金
        
        Args:
            size: 订单大小（正数=买入，负数=卖出）
            price: 成交价格
            pseudoexec: 是否是模拟执行
            
        Returns:
            佣金金额
        """
        # 默认使用 Taker 费率（保守估计）
        rate = self.p.taker_rate
        order_type = 'taker'
        
        # TODO: 在策略中通过 notify_order 来设置订单类型
        # 这里暂时使用平均费率作为近似
        # 如果需要精确区分，需要在策略层面传递订单类型信息
        
        # 计算佣金
        comm = abs(size) * price * rate
        
        logger.debug(
            f"Commission calculated: size={size}, price={price}, "
            f"type={order_type}, rate={rate}, comm={comm}"
        )
        
        return comm
    
    def set_order_type(self, order_ref, is_maker: bool):
        """
        设置订单类型（供策略调用）
        
        Args:
            order_ref: 订单引用
            is_maker: 是否是 Maker 订单
        """
        self._order_type_cache[order_ref] = 'maker' if is_maker else 'taker'


class ImprovedMakerTakerCommInfo(bt.CommInfoBase):
    """
    改进版 Maker/Taker 佣金（通过策略配合）
    
    使用方法：
    1. 在策略中保存订单类型：
       order = self.buy(exectype=bt.Order.Limit)
       self.broker.comminfo[None].register_order(order.ref, is_maker=True)
    
    2. 在 notify_order 中清理：
       self.broker.comminfo[None].unregister_order(order.ref)
    """
    
    params = (
        ('maker_rate', 0.0002),
        ('taker_rate', 0.0005),
        ('stocklike', True),
        ('commtype', bt.CommInfoBase.COMM_PERC),
        ('percabs', True),
    )
    
    def __init__(self):
        super().__init__()
        self._order_registry = {}
        logger.info(
            f"ImprovedMakerTakerCommInfo initialized: "
            f"maker={self.p.maker_rate}, taker={self.p.taker_rate}"
        )
    
    def register_order(self, order_ref, is_maker: bool):
        """注册订单类型"""
        self._order_registry[order_ref] = is_maker
        logger.debug(f"Order {order_ref} registered as {'maker' if is_maker else 'taker'}")
    
    def unregister_order(self, order_ref):
        """注销订单"""
        if order_ref in self._order_registry:
            del self._order_registry[order_ref]
    
    def _getcommission(self, size, price, pseudoexec):
        """计算佣金"""
        # 尝试从当前执行上下文获取订单信息
        # 这需要策略配合
        
        # 默认使用平均费率
        avg_rate = (self.p.maker_rate + self.p.taker_rate) / 2
        rate = avg_rate
        order_type = 'average'
        
        # 计算佣金
        comm = abs(size) * price * rate
        
        logger.debug(
            f"Commission: size={size}, price={price}, "
            f"type={order_type}, rate={rate}, comm={comm}"
        )
        
        return comm
```

**验收标准**:
- [ ] MakerTakerCommInfo 实现完成
- [ ] 基础版本使用平均费率
- [ ] 改进版本支持订单注册
- [ ] 日志输出完整
- [ ] 文档说明清楚

**预估工时**: 4小时

---

### 4.3 在 CommissionManager 中集成 Maker/Taker
**文件**: `backtest-worker/src/backtrader_integration/commission/commission_manager.py`

**任务**:
```python
- [ ] 导入 MakerTakerCommInfo
- [ ] 在 _setup_crypto_commission 中使用
- [ ] 添加 maker-taker 类型处理
- [ ] 更新日志
```

**代码补充**:
```python
from .maker_taker_commission import MakerTakerCommInfo

class CommissionManager:
    # ... 现有代码 ...
    
    def setup_broker(self, cerebro: bt.Cerebro, execution_config: Dict[str, Any]) -> None:
        """设置Broker"""
        asset_type = execution_config.get('assetType')
        
        # ... 现有代码 ...
        
        # 添加加密货币支持
        elif asset_type == 'crypto':
            self._setup_crypto_commission(cerebro, execution_config)
        else:
            raise ValueError(f"Unsupported asset type: {asset_type}")
    
    def _setup_crypto_commission(
        self,
        cerebro: bt.Cerebro,
        execution_config: Dict[str, Any]
    ) -> None:
        """
        配置加密货币佣金
        
        Args:
            cerebro: Backtrader Cerebro 实例
            execution_config: 执行配置
        """
        commission_config = execution_config['commission']
        comm_type = commission_config['type']
        
        logger.info(f"Setting up crypto commission, type: {comm_type}")
        
        if comm_type == 'maker-taker':
            # Maker/Taker 差异化费率
            maker_rate = commission_config.get('makerRate', 0.001)
            taker_rate = commission_config.get('takerRate', 0.001)
            
            cerebro.broker.addcommissioninfo(
                MakerTakerCommInfo(
                    maker_rate=maker_rate,
                    taker_rate=taker_rate
                )
            )
            
            logger.info(
                f"Maker/Taker commission set: "
                f"maker={maker_rate * 100}%, taker={taker_rate * 100}%"
            )
            
        elif comm_type == 'percentage':
            # 简单百分比佣金
            rate = commission_config.get('rate', 0.001)
            cerebro.broker.setcommission(
                commission=rate,
                stocklike=True,
                commtype=bt.CommInfoBase.COMM_PERC,
                percabs=True
            )
            logger.info(f"Crypto commission set: {rate * 100}%")
        else:
            raise ValueError(f"Unsupported commission type for crypto: {comm_type}")
```

**验收标准**:
- [ ] 集成完成
- [ ] 支持 maker-taker 类型
- [ ] 日志正确
- [ ] 编译通过

**预估工时**: 1小时

---

### 4.4 更新 BacktestExecutor
**文件**: `backtest-worker/src/backtrader_integration/execution/backtest_executor.py`

**任务**:
```python
- [ ] 导入 CommissionManager
- [ ] 在 _execute_standard_backtest 中使用
- [ ] 替换旧的佣金设置代码
- [ ] 更新日志
- [ ] 处理异常
```

**代码修改**:
```python
from ..commission.commission_manager import CommissionManager

class BacktestExecutor:
    def __init__(self, ...):
        # ... 现有代码 ...
        self.commission_manager = CommissionManager()
    
    def _execute_standard_backtest(self, task_message: Dict[str, Any]) -> Dict[str, Any]:
        """执行标准回测"""
        task_id = task_message['taskId']
        
        try:
            # 1. 创建Cerebro实例
            cerebro = bt.Cerebro()
            
            # 2. 设置Broker（使用 CommissionManager）
            try:
                self.commission_manager.setup_broker(
                    cerebro, 
                    task_message['executionConfig']
                )
                logger.info(f"Broker setup complete for task {task_id}")
            except Exception as e:
                logger.error(f"Failed to setup broker: {e}")
                raise
            
            # 3. 加载数据
            dataset_path = task_message['dataConfig']['datasetPath']
            # ... 现有的数据加载代码 ...
            
            # 4. 添加策略
            # ... 现有的策略添加代码 ...
            
            # 5. 执行回测
            # ... 现有的执行代码 ...
            
        except Exception as error:
            logger.error(f"Backtest execution failed: {error}")
            raise
```

**验收标准**:
- [ ] BacktestExecutor 更新完成
- [ ] 使用 CommissionManager
- [ ] 旧代码已移除
- [ ] 错误处理完善
- [ ] 日志输出正确

**预估工时**: 2小时

---

### 4.5 单元测试
**文件**: `backtest-worker/tests/test_commission_manager.py`

**任务**:
```python
- [ ] 测试股票百分比佣金
- [ ] 测试股票最低佣金
- [ ] 测试股票印花税
- [ ] 测试期货固定佣金
- [ ] 测试期货百分比佣金
- [ ] 测试期货保证金计算
- [ ] 测试 Maker/Taker 佣金
- [ ] 测试异常情况
```

**代码骨架**:
```python
import pytest
import backtrader as bt
from backtrader_integration.commission.commission_manager import CommissionManager


class TestCommissionManager:
    """CommissionManager 单元测试"""
    
    def test_stock_percentage_commission(self):
        """测试股票百分比佣金"""
        cerebro = bt.Cerebro()
        manager = CommissionManager()
        
        config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003
            }
        }
        
        manager.setup_broker(cerebro, config)
        
        # 验证初始资金
        assert cerebro.broker.getcash() == 100000
        
        # 验证佣金设置
        # TODO: 添加佣金计算验证
    
    def test_stock_min_commission(self):
        """测试股票最低佣金"""
        cerebro = bt.Cerebro()
        manager = CommissionManager()
        
        config = {
            'initialCapital': 100000,
            'assetType': 'stock',
            'commission': {
                'type': 'percentage',
                'rate': 0.0003,
                'minCommission': 5.0
            }
        }
        
        manager.setup_broker(cerebro, config)
        
        # 验证小额交易触发最低佣金
        # TODO: 模拟交易并验证佣金
    
    def test_futures_fixed_commission(self):
        """测试期货固定佣金"""
        cerebro = bt.Cerebro()
        manager = CommissionManager()
        
        config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'contractSpecs': {
                'multiplier': 10,
                'marginRatio': 0.09
            },
            'commission': {
                'type': 'fixed',
                'amount': 2.0
            }
        }
        
        manager.setup_broker(cerebro, config)
        
        # 验证期货佣金
        # TODO: 模拟期货交易并验证
    
    def test_futures_requires_contract_specs(self):
        """测试期货必须有合约规格"""
        cerebro = bt.Cerebro()
        manager = CommissionManager()
        
        config = {
            'initialCapital': 100000,
            'assetType': 'futures',
            'commission': {
                'type': 'fixed',
                'amount': 2.0
            }
        }
        
        # 应该抛出异常
        with pytest.raises(ValueError, match="requires contractSpecs"):
            manager.setup_broker(cerebro, config)
    
    def test_maker_taker_commission(self):
        """测试 Maker/Taker 佣金"""
        cerebro = bt.Cerebro()
        manager = CommissionManager()
        
        config = {
            'initialCapital': 100000,
            'assetType': 'crypto',
            'commission': {
                'type': 'maker-taker',
                'makerRate': 0.0002,
                'takerRate': 0.0005
            }
        }
        
        manager.setup_broker(cerebro, config)
        
        # 验证 Maker/Taker 佣金
        # TODO: 验证佣金计算
```

**验收标准**:
- [ ] 所有测试用例编写完成
- [ ] 测试覆盖率 > 80%
- [ ] 所有测试通过
- [ ] Mock 和 fixture 正确使用

**预估工时**: 4小时

---

## Phase 5: 前端适配（2-3天）

### 5.1 创建资产类型选择组件
**文件**: `frontend/src/modules/backtesting/components/AssetTypeSelector.tsx`

**任务**:
```tsx
- [ ] 创建资产类型选择器组件
- [ ] 支持 stock 和 futures
- [ ] 显示资产类型说明
- [ ] 添加图标和样式
```

**代码实现**:
```tsx
import React from 'react';
import { Radio, Space, Typography, Card } from 'antd';
import { StockOutlined, LineChartOutlined } from '@ant-design/icons';
import { AssetType } from '@/shared/api/backtestTasks';

const { Text } = Typography;

export interface AssetTypeSelectorProps {
  value?: AssetType;
  onChange?: (value: AssetType) => void;
  disabled?: boolean;
}

export const AssetTypeSelector: React.FC<AssetTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <Radio.Group 
      value={value} 
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card 
          hoverable={!disabled}
          style={{ 
            borderColor: value === AssetType.STOCK ? '#1890ff' : undefined 
          }}
        >
          <Radio value={AssetType.STOCK}>
            <Space>
              <StockOutlined style={{ fontSize: 20 }} />
              <div>
                <div><strong>股票</strong></div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  适用于 A股、港股、美股等现货交易
                </Text>
              </div>
            </Space>
          </Radio>
        </Card>

        <Card 
          hoverable={!disabled}
          style={{ 
            borderColor: value === AssetType.FUTURES ? '#1890ff' : undefined 
          }}
        >
          <Radio value={AssetType.FUTURES}>
            <Space>
              <LineChartOutlined style={{ fontSize: 20 }} />
              <div>
                <div><strong>期货</strong></div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  适用于商品期货、股指期货等保证金交易
                </Text>
              </div>
            </Space>
          </Radio>
        </Card>
      </Space>
    </Radio.Group>
  );
};
```

**验收标准**:
- [ ] 组件编译通过
- [ ] 样式美观
- [ ] 交互流畅
- [ ] 支持禁用状态

**预估工时**: 2小时

---

### 5.2 创建合约规格配置组件
**文件**: `frontend/src/modules/backtesting/components/ContractSpecsForm.tsx`

**任务**:
```tsx
- [ ] 创建合约规格表单组件
- [ ] 根据资产类型显示不同字段
- [ ] 股票：lotSize, tickSize
- [ ] 期货：multiplier, marginRatio, tickSize
- [ ] 添加字段说明和示例
- [ ] 添加表单验证
```

**代码实现**:
```tsx
import React from 'react';
import { Form, InputNumber, Space, Typography, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { AssetType, ContractSpecs } from '@/shared/api/backtestTasks';

const { Text } = Typography;

export interface ContractSpecsFormProps {
  assetType: AssetType;
  disabled?: boolean;
}

export const ContractSpecsForm: React.FC<ContractSpecsFormProps> = ({
  assetType,
  disabled = false,
}) => {
  if (assetType === AssetType.STOCK) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Form.Item
          name={['executionConfig', 'contractSpecs', 'lotSize']}
          label={
            <Space>
              <span>最小交易手数</span>
              <Tooltip title="股票最小交易单位，A股通常为100股/手">
                <QuestionCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[
            { required: false },
            { type: 'number', min: 1, message: '最小手数必须大于0' }
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            step={1}
            placeholder="例如: 100（A股）"
            disabled={disabled}
          />
        </Form.Item>

        <Form.Item
          name={['executionConfig', 'contractSpecs', 'tickSize']}
          label={
            <Space>
              <span>最小变动价位</span>
              <Tooltip title="价格的最小变动单位，A股通常为0.01元">
                <QuestionCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[
            { required: false },
            { type: 'number', min: 0, message: '价位必须大于0' }
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={0.01}
            placeholder="例如: 0.01（A股）"
            disabled={disabled}
          />
        </Form.Item>
      </Space>
    );
  }

  if (assetType === AssetType.FUTURES) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Form.Item
          name={['executionConfig', 'contractSpecs', 'multiplier']}
          label={
            <Space>
              <span>合约乘数</span>
              <Tooltip title="每手合约对应的标的物数量，如螺纹钢为10吨/手">
                <QuestionCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[
            { required: true, message: '期货必须设置合约乘数' },
            { type: 'number', min: 1, message: '乘数必须大于0' }
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            step={1}
            placeholder="例如: 10（螺纹钢）"
            disabled={disabled}
          />
        </Form.Item>

        <Form.Item
          name={['executionConfig', 'contractSpecs', 'marginRatio']}
          label={
            <Space>
              <span>保证金比例</span>
              <Tooltip title="开仓所需的保证金占合约价值的比例">
                <QuestionCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[
            { required: true, message: '期货必须设置保证金比例' },
            { type: 'number', min: 0, max: 1, message: '比例必须在0-1之间' }
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={1}
            step={0.01}
            formatter={value => `${(Number(value) * 100).toFixed(0)}%`}
            parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
            placeholder="例如: 9%（螺纹钢）"
            disabled={disabled}
          />
        </Form.Item>

        <Form.Item
          name={['executionConfig', 'contractSpecs', 'tickSize']}
          label={
            <Space>
              <span>最小变动价位</span>
              <Tooltip title="价格的最小变动单位">
                <QuestionCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[
            { required: false },
            { type: 'number', min: 0, message: '价位必须大于0' }
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={0.1}
            placeholder="例如: 1.0（螺纹钢）"
            disabled={disabled}
          />
        </Form.Item>

        <Text type="secondary" style={{ fontSize: 12 }}>
          💡 示例：螺纹钢期货 rb2401 - 乘数10，保证金9%，最小变动1元
        </Text>
      </Space>
    );
  }

  return null;
};
```

**验收标准**:
- [ ] 组件编译通过
- [ ] 根据资产类型正确显示字段
- [ ] 表单验证生效
- [ ] 提示信息清晰
- [ ] 示例有帮助

**预估工时**: 3小时

---

### 5.3 创建佣金配置组件
**文件**: `frontend/src/modules/backtesting/components/CommissionForm.tsx`

**任务**:
```tsx
- [ ] 创建佣金配置表单组件
- [ ] 根据资产类型显示不同佣金类型
- [ ] 股票：百分比佣金 + 最低佣金 + 印花税
- [ ] 期货：固定佣金 或 百分比佣金
- [ ] 添加常用市场的预设值
- [ ] 表单验证
```

**代码实现**:
```tsx
import React from 'react';
import { Form, InputNumber, Select, Space, Typography, Button, Row, Col } from 'antd';
import { AssetType, CommissionType } from '@/shared/api/backtestTasks';

const { Text } = Typography;
const { Option } = Select;

export interface CommissionFormProps {
  assetType: AssetType;
  disabled?: boolean;
}

// 预设配置
const PRESETS = {
  [AssetType.STOCK]: {
    'A股（万三）': {
      type: CommissionType.PERCENTAGE,
      rate: 0.0003,
      minCommission: 5,
      stampDuty: 0.001,
    },
    'A股（万二点五）': {
      type: CommissionType.PERCENTAGE,
      rate: 0.00025,
      minCommission: 5,
      stampDuty: 0.001,
    },
    '美股': {
      type: CommissionType.PERCENTAGE,
      rate: 0.0003,
      minCommission: 0,
      stampDuty: 0,
    },
  },
  [AssetType.FUTURES]: {
    '螺纹钢（万一）': {
      type: CommissionType.PERCENTAGE,
      rate: 0.0001,
    },
    '螺纹钢（固定2元）': {
      type: CommissionType.FIXED,
      amount: 2.0,
    },
    'E-mini S&P 500': {
      type: CommissionType.FIXED,
      amount: 1.24,
    },
  },
};

export const CommissionForm: React.FC<CommissionFormProps> = ({
  assetType,
  disabled = false,
}) => {
  const form = Form.useFormInstance();

  // 应用预设
  const applyPreset = (presetName: string) => {
    const preset = PRESETS[assetType]?.[presetName];
    if (preset) {
      form.setFieldsValue({
        executionConfig: {
          commission: preset,
        },
      });
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 预设选择 */}
      <div>
        <Text strong>常用配置</Text>
        <div style={{ marginTop: 8 }}>
          <Space wrap>
            {Object.keys(PRESETS[assetType] || {}).map((name) => (
              <Button
                key={name}
                size="small"
                onClick={() => applyPreset(name)}
                disabled={disabled}
              >
                {name}
              </Button>
            ))}
          </Space>
        </div>
      </div>

      {/* 佣金类型 */}
      <Form.Item
        name={['executionConfig', 'commission', 'type']}
        label="佣金类型"
        rules={[{ required: true, message: '请选择佣金类型' }]}
      >
        <Select placeholder="选择佣金类型" disabled={disabled}>
          {assetType === AssetType.STOCK && (
            <Option value={CommissionType.PERCENTAGE}>百分比佣金</Option>
          )}
          {assetType === AssetType.FUTURES && (
            <>
              <Option value={CommissionType.FIXED}>固定佣金（推荐）</Option>
              <Option value={CommissionType.PERCENTAGE}>百分比佣金</Option>
            </>
          )}
        </Select>
      </Form.Item>

      {/* 根据佣金类型显示字段 */}
      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) =>
          prevValues.executionConfig?.commission?.type !==
          currentValues.executionConfig?.commission?.type
        }
      >
        {({ getFieldValue }) => {
          const commType = getFieldValue(['executionConfig', 'commission', 'type']);

          if (commType === CommissionType.FIXED) {
            return (
              <Form.Item
                name={['executionConfig', 'commission', 'amount']}
                label="固定佣金（元/手）"
                rules={[
                  { required: true, message: '请输入固定佣金' },
                  { type: 'number', min: 0, message: '佣金不能为负' },
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.1}
                  placeholder="例如: 2.0"
                  disabled={disabled}
                />
              </Form.Item>
            );
          }

          if (commType === CommissionType.PERCENTAGE) {
            return (
              <>
                <Form.Item
                  name={['executionConfig', 'commission', 'rate']}
                  label="佣金率"
                  rules={[
                    { required: true, message: '请输入佣金率' },
                    { type: 'number', min: 0, max: 0.1, message: '佣金率必须在0-10%之间' },
                  ]}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    max={0.1}
                    step={0.0001}
                    formatter={(value) => `${(Number(value) * 10000).toFixed(1)}‱`}
                    parser={(value) => (parseFloat(value?.replace('‱', '') || '0') / 10000) as any}
                    placeholder="例如: 3‱（万分之三）"
                    disabled={disabled}
                  />
                </Form.Item>

                {assetType === AssetType.STOCK && (
                  <>
                    <Form.Item
                      name={['executionConfig', 'commission', 'minCommission']}
                      label="最低佣金（元）"
                      rules={[{ type: 'number', min: 0, message: '最低佣金不能为负' }]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        step={1}
                        placeholder="例如: 5（A股最低5元）"
                        disabled={disabled}
                      />
                    </Form.Item>

                    <Form.Item
                      name={['executionConfig', 'commission', 'stampDuty']}
                      label="印花税率（仅卖出）"
                      rules={[{ type: 'number', min: 0, max: 0.01, message: '印花税率必须在0-1%之间' }]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={0.01}
                        step={0.0001}
                        formatter={(value) => `${(Number(value) * 1000).toFixed(1)}‰`}
                        parser={(value) => (parseFloat(value?.replace('‰', '') || '0') / 1000) as any}
                        placeholder="例如: 1‰（A股千分之一）"
                        disabled={disabled}
                      />
                    </Form.Item>
                  </>
                )}
              </>
            );
          }

          return null;
        }}
      </Form.Item>
    </Space>
  );
};
```

**验收标准**:
- [ ] 组件编译通过
- [ ] 预设配置可用
- [ ] 根据佣金类型显示不同字段
- [ ] 表单验证生效
- [ ] 格式化显示友好（万分之、千分之）

**预估工时**: 4小时

---

### 5.4 重构创建任务模态框
**文件**: `frontend/src/modules/backtesting/components/CreateBacktestTaskModal.tsx`

**任务**:
```tsx
- [ ] 导入新组件
- [ ] 添加资产类型选择步骤
- [ ] 集成合约规格表单
- [ ] 集成佣金配置表单
- [ ] 移除旧的 fees 字段
- [ ] 更新表单初始值
- [ ] 更新表单提交逻辑
```

**主要修改**:
```tsx
import { AssetTypeSelector } from './AssetTypeSelector';
import { ContractSpecsForm } from './ContractSpecsForm';
import { CommissionForm } from './CommissionForm';
import { AssetType, CommissionType } from '@/shared/api/backtestTasks';

export const CreateBacktestTaskModal: React.FC<Props> = ({ ... }) => {
  const [form] = Form.useForm();

  // 初始值
  const initialValues = {
    executionConfig: {
      initialCapital: 100000,
      assetType: AssetType.STOCK,  // 默认股票
      commission: {
        type: CommissionType.PERCENTAGE,
        rate: 0.0003,
        minCommission: 5,
        stampDuty: 0.001,
      },
      slippage: 0,
    },
  };

  return (
    <Modal ...>
      <Form form={form} initialValues={initialValues}>
        {/* ... 其他字段 ... */}

        {/* 资产类型选择 */}
        <Form.Item
          name={['executionConfig', 'assetType']}
          label="资产类型"
          rules={[{ required: true, message: '请选择资产类型' }]}
        >
          <AssetTypeSelector />
        </Form.Item>

        {/* 合约规格配置 */}
        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) =>
            prev.executionConfig?.assetType !== curr.executionConfig?.assetType
          }
        >
          {({ getFieldValue }) => {
            const assetType = getFieldValue(['executionConfig', 'assetType']);
            if (assetType) {
              return (
                <div style={{ marginLeft: 24, marginBottom: 16 }}>
                  <Typography.Title level={5}>合约规格</Typography.Title>
                  <ContractSpecsForm assetType={assetType} />
                </div>
              );
            }
            return null;
          }}
        </Form.Item>

        {/* 佣金配置 */}
        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) =>
            prev.executionConfig?.assetType !== curr.executionConfig?.assetType
          }
        >
          {({ getFieldValue }) => {
            const assetType = getFieldValue(['executionConfig', 'assetType']);
            if (assetType) {
              return (
                <div style={{ marginLeft: 24, marginBottom: 16 }}>
                  <Typography.Title level={5}>佣金配置</Typography.Title>
                  <CommissionForm assetType={assetType} />
                </div>
              );
            }
            return null;
          }}
        </Form.Item>

        {/* ... 其他字段 ... */}
      </Form>
    </Modal>
  );
};
```

**验收标准**:
- [ ] 模态框编译通过
- [ ] 资产类型选择可用
- [ ] 动态显示合约规格表单
- [ ] 动态显示佣金配置表单
- [ ] 表单提交正确
- [ ] 旧字段已移除

**预估工时**: 3小时

---

### 5.5 更新数据集导入页面
**文件**: `frontend/src/modules/trading-data/components/CreateDatasetModal.tsx`

**任务**:
```tsx
- [ ] 添加资产类型选择
- [ ] 添加合约规格配置（期货必填）
- [ ] 更新表单验证
- [ ] 更新提交逻辑
```

**验收标准**:
- [ ] 导入时可以选择资产类型
- [ ] 期货必须填写合约规格
- [ ] 表单验证正确
- [ ] 提交成功

**预估工时**: 2小时

---

## Phase 6: 测试和文档（1-2天）

### 6.1 端到端测试
**任务**:
```
- [ ] 准备测试数据（股票、期货各一个）
- [ ] 测试股票回测流程（A股配置）
- [ ] 测试期货回测流程（螺纹钢配置）
- [ ] 验证佣金计算正确性
- [ ] 验证期货保证金正确性
- [ ] 验证期货盈亏计算正确性
- [ ] 测试边界情况
- [ ] 测试异常处理
```

**测试用例**:

#### 用例1：A股回测
```json
{
  "taskName": "A股回测测试",
  "executionConfig": {
    "initialCapital": 100000,
    "assetType": "stock",
    "contractSpecs": {
      "lotSize": 100,
      "tickSize": 0.01
    },
    "commission": {
      "type": "percentage",
      "rate": 0.0003,
      "minCommission": 5.0,
      "stampDuty": 0.001
    }
  }
}
```

**验证点**:
- [ ] 买入1000股（10手），价格10元，佣金应为 max(1000 * 10 * 0.0003, 5) = 5元
- [ ] 卖出1000股，价格11元，佣金应为 max(1000 * 11 * 0.0003, 5) + 1000 * 11 * 0.001 = 5 + 11 = 16元

#### 用例2：螺纹钢期货回测
```json
{
  "taskName": "期货回测测试",
  "executionConfig": {
    "initialCapital": 100000,
    "assetType": "futures",
    "contractSpecs": {
      "multiplier": 10,
      "marginRatio": 0.09,
      "tickSize": 1.0
    },
    "commission": {
      "type": "fixed",
      "amount": 2.0
    }
  }
}
```

**验证点**:
- [ ] 买入1手，价格4000元，佣金应为2元
- [ ] 保证金应为 1 * 4000 * 10 * 0.09 = 3600元
- [ ] 剩余资金应为 100000 - 2 - 3600 = 96398元
- [ ] 价格涨到4100元，浮盈应为 1 * (4100 - 4000) * 10 = 1000元

**预估工时**: 4小时

---

### 6.2 性能测试
**任务**:
```
- [ ] 测试大数据集回测（100万条数据）
- [ ] 对比优化前后的性能
- [ ] 验证内存使用
- [ ] 验证执行时间
```

**验收标准**:
- [ ] 性能无明显下降
- [ ] 内存使用正常
- [ ] 无内存泄漏

**预估工时**: 2小时

---

### 6.3 更新文档
**任务**:
```
- [ ] 更新 API 文档
- [ ] 更新用户手册
- [ ] 添加配置示例
- [ ] 添加FAQ
- [ ] 更新 README
```

**文档列表**:

1. **API 文档** (`docs/api/backtest-api.md`)
   - ExecutionConfig 新字段说明
   - 示例请求和响应

2. **用户手册** (`docs/user-guide/backtest-configuration.md`)
   - 如何选择资产类型
   - 如何配置股票佣金
   - 如何配置期货佣金
   - 常见市场配置示例

3. **开发文档** (`docs/developer-guide/commission-system.md`)
   - CommissionManager 架构
   - 如何扩展新的资产类型
   - 如何自定义佣金计算

4. **FAQ** (`docs/faq/commission-faq.md`)
   - 为什么期货必须设置合约乘数？
   - 如何计算保证金？
   - Maker/Taker 是如何区分的？

**预估工时**: 4小时

---

### 6.4 示例策略
**任务**:
```
- [ ] 创建股票示例策略
- [ ] 创建期货示例策略
- [ ] 添加注释说明
- [ ] 验证可运行
```

**文件**: `examples/stock-sma-strategy.py`
```python
"""
股票双均线策略示例

资产类型：股票（A股）
佣金配置：万分之三，最低5元，印花税千分之一
"""
import backtrader as bt

class StockSMAStrategy(bt.Strategy):
    params = (
        ('fast_period', 5),
        ('slow_period', 20),
    )
    
    def __init__(self):
        self.sma_fast = bt.indicators.SMA(self.data.close, period=self.p.fast_period)
        self.sma_slow = bt.indicators.SMA(self.data.close, period=self.p.slow_period)
    
    def next(self):
        if not self.position:
            if self.sma_fast[0] > self.sma_slow[0]:
                # 买入1手（100股）
                size = 100
                self.buy(size=size)
        else:
            if self.sma_fast[0] < self.sma_slow[0]:
                self.sell(size=self.position.size)
```

**文件**: `examples/futures-breakout-strategy.py`
```python
"""
期货突破策略示例

资产类型：期货（螺纹钢 rb2401）
合约乘数：10吨/手
保证金比例：9%
佣金配置：固定2元/手
"""
import backtrader as bt

class FuturesBreakoutStrategy(bt.Strategy):
    params = (
        ('period', 20),
    )
    
    def __init__(self):
        self.highest = bt.indicators.Highest(self.data.high, period=self.p.period)
        self.lowest = bt.indicators.Lowest(self.data.low, period=self.p.period)
    
    def next(self):
        if not self.position:
            if self.data.close[0] > self.highest[-1]:
                # 买入1手期货
                self.buy(size=1)
        else:
            if self.data.close[0] < self.lowest[-1]:
                self.close()
```

**验收标准**:
- [ ] 示例策略可运行
- [ ] 注释清晰
- [ ] 配置正确

**预估工时**: 2小时

---

## 📊 总体进度跟踪

### 工时统计

| Phase | 预估工时（小时） | 预估工作日 |
|-------|----------------|-----------|
| Phase 1: 数据模型扩展 | 4.5 | 0.5-1天 |
| Phase 2: 类型定义和DTO | 7 | 1天 |
| Phase 3: 后端集成 | 4 | 0.5天 |
| Phase 4: Worker实现 | 17 | 2-3天 |
| Phase 5: 前端适配 | 14 | 2天 |
| Phase 6: 测试和文档 | 12 | 1.5天 |
| **总计** | **58.5小时** | **7.5-9天** |

考虑到调试、沟通、问题解决等因素，**建议预留 10-12 个工作日**。

---

## ✅ 验收清单

### 功能验收
- [ ] 支持股票资产类型
- [ ] 支持期货资产类型
- [ ] 支持百分比佣金
- [ ] 支持固定佣金
- [ ] 支持最低佣金限制
- [ ] 支持印花税
- [ ] 支持期货合约乘数
- [ ] 支持期货保证金比例
- [ ] 支持 Maker/Taker 差异化费率

### 质量验收
- [ ] 单元测试覆盖率 > 80%
- [ ] 所有单元测试通过
- [ ] 端到端测试通过
- [ ] 性能测试无回归
- [ ] 无内存泄漏
- [ ] 代码审查通过
- [ ] 文档完整

### 用户体验验收
- [ ] 界面美观易用
- [ ] 交互流畅
- [ ] 错误提示清晰
- [ ] 帮助文档易懂
- [ ] 示例配置可用

---

## 🚀 下一步行动

1. **确认TODO列表**
   - [ ] 与用户确认任务划分合理
   - [ ] 确认工时估算可接受
   - [ ] 明确优先级和里程碑

2. **环境准备**
   - [ ] 创建开发分支 `feature/commission-optimization`
   - [ ] 准备测试数据
   - [ ] 配置开发环境

3. **启动 Phase 1**
   - [ ] 创建数据库迁移脚本
   - [ ] 更新 Entity
   - [ ] 清理历史数据
   - [ ] 运行迁移

---

**准备就绪，等待您的确认！** 🎯

