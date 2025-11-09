// backend/src/backtesting/strategy/validators/schema-validator.example.ts

/**
 * SchemaValidator使用示例
 * 
 * 本文件展示如何使用SchemaValidatorService来校验和解析策略的参数和因子Schema
 */

import { SchemaValidatorService } from './schema-validator.service';
import { FieldSchema } from './schema.types';

// 创建服务实例
const validator = new SchemaValidatorService();

// ============================================
// 示例1: 定义和校验参数Schema
// ============================================

console.log('\n=== 示例1: 定义和校验参数Schema ===\n');

const parametersSchema: Record<string, FieldSchema> = {
  fastPeriod: {
    key: 'fastPeriod',
    label: '快线周期',
    desc: '快速移动平均线的周期',
    type: 'number',
    component: 'number',
    defaultValue: 5,
    required: true,
    validator: {
      min: 1,
      max: 50,
      message: '快线周期必须在1-50之间',
    },
  },
  slowPeriod: {
    key: 'slowPeriod',
    label: '慢线周期',
    desc: '慢速移动平均线的周期',
    type: 'number',
    component: 'number',
    defaultValue: 20,
    required: true,
    validator: {
      min: 2,
      max: 200,
      message: '慢线周期必须在2-200之间',
    },
  },
  maType: {
    key: 'maType',
    label: 'MA类型',
    desc: '移动平均线的计算方式',
    type: 'string',
    component: 'select',
    defaultValue: 'SMA',
    enumOptions: [
      { label: '简单移动平均(SMA)', value: 'SMA' },
      { label: '指数移动平均(EMA)', value: 'EMA' },
      { label: '加权移动平均(WMA)', value: 'WMA' },
    ],
  },
  enableStopLoss: {
    key: 'enableStopLoss',
    label: '启用止损',
    type: 'boolean',
    component: 'checkbox',
    defaultValue: true,
  },
};

const paramResult = validator.validate(parametersSchema);
console.log('参数Schema校验结果:', paramResult.valid ? '✅ 通过' : '❌ 失败');
if (!paramResult.valid) {
  console.log('错误信息:', paramResult.errors);
}

// ============================================
// 示例2: 定义和校验因子Schema
// ============================================

console.log('\n=== 示例2: 定义和校验因子Schema ===\n');

const factorsSchema: Record<string, FieldSchema> = {
  ma_fast: {
    key: 'ma_fast',
    label: '快线MA',
    desc: '快速移动平均线的值',
    type: 'number',
    component: 'number',
  },
  ma_slow: {
    key: 'ma_slow',
    label: '慢线MA',
    desc: '慢速移动平均线的值',
    type: 'number',
    component: 'number',
  },
  signal: {
    key: 'signal',
    label: '交易信号',
    desc: '当前的交易信号',
    type: 'string',
    component: 'select',
    enumOptions: [
      { label: '买入', value: 'buy' },
      { label: '卖出', value: 'sell' },
      { label: '持有', value: 'hold' },
    ],
  },
  isGoldenCross: {
    key: 'isGoldenCross',
    label: '金叉信号',
    desc: '是否出现金叉',
    type: 'boolean',
    component: 'checkbox',
  },
};

const factorResult = validator.validate(factorsSchema);
console.log('因子Schema校验结果:', factorResult.valid ? '✅ 通过' : '❌ 失败');
if (!factorResult.valid) {
  console.log('错误信息:', factorResult.errors);
}

// ============================================
// 示例3: 从策略脚本中解析Schema
// ============================================

console.log('\n=== 示例3: 从策略脚本中解析Schema ===\n');

const strategyScript = `
  // 定义策略参数
  exports.parameters = {
    period: {
      key: 'period',
      label: '周期',
      desc: 'MA周期',
      type: 'number',
      component: 'number',
      defaultValue: 20,
      validator: {
        min: 1,
        max: 200,
        message: '周期必须在1-200之间',
      },
    },
    threshold: {
      key: 'threshold',
      label: '阈值',
      desc: '信号触发阈值',
      type: 'number',
      component: 'range',
      defaultValue: 0.02,
      validator: {
        min: 0.001,
        max: 0.1,
      },
    },
  };
  
  // 定义因子
  exports.factors = {
    ma: {
      key: 'ma',
      label: '移动平均',
      type: 'number',
      component: 'number',
    },
    price_change: {
      key: 'price_change',
      label: '价格变化率',
      type: 'number',
      component: 'number',
    },
  };
`;

(async () => {
  try {
    const parsed = await validator.parseSchemaFromScript(strategyScript);
    console.log('解析成功！');
    console.log('参数数量:', Object.keys(parsed.parameters).length);
    console.log('因子数量:', Object.keys(parsed.factors).length);
    
    // 校验解析出的Schema
    const parsedParamResult = validator.validate(parsed.parameters);
    const parsedFactorResult = validator.validate(parsed.factors);
    
    console.log('解析的参数Schema校验:', parsedParamResult.valid ? '✅ 通过' : '❌ 失败');
    console.log('解析的因子Schema校验:', parsedFactorResult.valid ? '✅ 通过' : '❌ 失败');
  } catch (error) {
    console.error('解析失败:', error.message);
  }
})();

// ============================================
// 示例4: 错误处理
// ============================================

console.log('\n=== 示例4: 错误处理 ===\n');

const invalidSchema: Record<string, FieldSchema> = {
  period: {
    key: 'wrongKey', // key不匹配
    label: '周期',
    type: 'number',
    component: 'number',
  },
  strategy: {
    key: 'strategy',
    label: '策略类型',
    type: 'string',
    component: 'select',
    // 缺少enumOptions
  } as any,
  threshold: {
    key: 'threshold',
    label: '阈值',
    type: 'number',
    component: 'number',
    validator: {
      min: 100,
      max: 10, // min > max
    },
  },
};

const invalidResult = validator.validate(invalidSchema);
console.log('无效Schema校验结果:', invalidResult.valid ? '✅ 通过' : '❌ 失败');
if (!invalidResult.valid) {
  console.log('\n发现的错误:');
  invalidResult.errors.forEach((error, index) => {
    console.log(`  ${index + 1}. [${error.code}] ${error.field}: ${error.message}`);
  });
}

// ============================================
// 示例5: 在NestJS Controller中使用
// ============================================

console.log('\n=== 示例5: 在NestJS Controller中使用 ===\n');

/**
 * 在Controller中使用SchemaValidator的示例代码:
 * 
 * ```typescript
 * import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
 * import { SchemaValidatorService } from './validators/schema-validator.service';
 * 
 * @Controller('strategies')
 * export class StrategiesController {
 *   constructor(private readonly schemaValidator: SchemaValidatorService) {}
 * 
 *   @Post()
 *   async createStrategy(@Body() dto: CreateStrategyDto) {
 *     // 1. 从脚本中解析Schema
 *     const { parameters, factors } = await this.schemaValidator
 *       .parseSchemaFromScript(dto.scriptCode);
 *     
 *     // 2. 校验参数Schema
 *     const paramResult = this.schemaValidator.validate(parameters);
 *     if (!paramResult.valid) {
 *       throw new BadRequestException({
 *         message: '参数Schema校验失败',
 *         errors: paramResult.errors,
 *       });
 *     }
 *     
 *     // 3. 校验因子Schema
 *     const factorResult = this.schemaValidator.validate(factors);
 *     if (!factorResult.valid) {
 *       throw new BadRequestException({
 *         message: '因子Schema校验失败',
 *         errors: factorResult.errors,
 *       });
 *     }
 *     
 *     // 4. 保存策略
 *     return this.strategiesService.create({
 *       ...dto,
 *       parametersSchema: parameters,
 *       factorsSchema: factors,
 *     });
 *   }
 * }
 * ```
 */

console.log('请参考上面的代码注释，了解如何在Controller中使用SchemaValidator');

// ============================================
// 示例6: 各种字段类型的定义
// ============================================

console.log('\n=== 示例6: 各种字段类型的定义 ===\n');

const allTypesSchema: Record<string, FieldSchema> = {
  // 数字输入
  numberInput: {
    key: 'numberInput',
    label: '数字输入',
    type: 'number',
    component: 'number',
    defaultValue: 100,
    validator: { min: 0, max: 1000 },
  },
  
  // 范围滑块
  rangeSlider: {
    key: 'rangeSlider',
    label: '范围滑块',
    type: 'number',
    component: 'range',
    defaultValue: 50,
    validator: { min: 0, max: 100 },
  },
  
  // 文本输入
  textInput: {
    key: 'textInput',
    label: '文本输入',
    type: 'string',
    component: 'input',
    defaultValue: 'default text',
  },
  
  // 下拉选择
  selectInput: {
    key: 'selectInput',
    label: '下拉选择',
    type: 'string',
    component: 'select',
    enumOptions: [
      { label: '选项1', value: 'option1' },
      { label: '选项2', value: 'option2' },
    ],
  },
  
  // 单选按钮
  radioInput: {
    key: 'radioInput',
    label: '单选按钮',
    type: 'string',
    component: 'radio',
    enumOptions: [
      { label: '是', value: 'yes' },
      { label: '否', value: 'no' },
    ],
  },
  
  // 复选框
  checkboxInput: {
    key: 'checkboxInput',
    label: '复选框',
    type: 'boolean',
    component: 'checkbox',
    defaultValue: false,
  },
  
  // 日期选择
  dateInput: {
    key: 'dateInput',
    label: '日期选择',
    type: 'string',
    component: 'date',
    defaultValue: '2024-01-01',
  },
};

const allTypesResult = validator.validate(allTypesSchema);
console.log('所有类型Schema校验结果:', allTypesResult.valid ? '✅ 通过' : '❌ 失败');
console.log('支持的字段类型数量:', Object.keys(allTypesSchema).length);

