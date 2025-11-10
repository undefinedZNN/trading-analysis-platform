/**
 * 版本对比相关DTO
 * 
 * @module strategies/dto/version-compare
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

/**
 * 对比模式
 */
export enum CompareMode {
  /** 代码差异 */
  CODE = 'code',
  /** Schema差异 */
  SCHEMA = 'schema',
  /** 完整对比 */
  FULL = 'full',
}

/**
 * 差异类型
 */
export enum DiffType {
  /** 新增 */
  ADDED = 'added',
  /** 删除 */
  REMOVED = 'removed',
  /** 修改 */
  MODIFIED = 'modified',
  /** 无变化 */
  UNCHANGED = 'unchanged',
}

/**
 * 版本对比请求DTO
 */
export class CompareVersionsDto {
  @ApiProperty({
    description: '策略ID',
    example: 'strategy-123',
  })
  @IsString()
  strategyId: string;

  @ApiProperty({
    description: '源版本ID',
    example: 'v1.0.0',
  })
  @IsString()
  sourceVersionId: string;

  @ApiProperty({
    description: '目标版本ID',
    example: 'v1.1.0',
  })
  @IsString()
  targetVersionId: string;

  @ApiProperty({
    description: '对比模式',
    enum: CompareMode,
    default: CompareMode.FULL,
    required: false,
  })
  @IsEnum(CompareMode)
  @IsOptional()
  mode?: CompareMode = CompareMode.FULL;
}

/**
 * 代码行差异
 */
export interface CodeLineDiff {
  /** 行号 */
  lineNumber: number;
  /** 差异类型 */
  type: DiffType;
  /** 行内容 */
  content: string;
  /** 原始行号(如果有) */
  oldLineNumber?: number;
  /** 新行号(如果有) */
  newLineNumber?: number;
}

/**
 * 代码块差异
 */
export interface CodeBlockDiff {
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 差异类型 */
  type: DiffType;
  /** 代码行列表 */
  lines: CodeLineDiff[];
}

/**
 * 代码差异结果
 */
export interface CodeDiffResult {
  /** 源版本代码 */
  sourceCode: string;
  /** 目标版本代码 */
  targetCode: string;
  /** 差异块列表 */
  diffBlocks: CodeBlockDiff[];
  /** 统计信息 */
  stats: {
    /** 新增行数 */
    addedLines: number;
    /** 删除行数 */
    removedLines: number;
    /** 修改行数 */
    modifiedLines: number;
    /** 未变化行数 */
    unchangedLines: number;
  };
}

/**
 * Schema字段差异
 */
export interface SchemaFieldDiff {
  /** 字段名 */
  fieldName: string;
  /** 差异类型 */
  type: DiffType;
  /** 源值 */
  sourceValue?: any;
  /** 目标值 */
  targetValue?: any;
  /** 变化描述 */
  description?: string;
}

/**
 * Schema差异结果
 */
export interface SchemaDiffResult {
  /** 参数Schema差异 */
  parameters: {
    /** 新增字段 */
    added: SchemaFieldDiff[];
    /** 删除字段 */
    removed: SchemaFieldDiff[];
    /** 修改字段 */
    modified: SchemaFieldDiff[];
  };
  /** 因子Schema差异 */
  factors: {
    /** 新增字段 */
    added: SchemaFieldDiff[];
    /** 删除字段 */
    removed: SchemaFieldDiff[];
    /** 修改字段 */
    modified: SchemaFieldDiff[];
  };
}

/**
 * 版本对比响应DTO
 */
export class CompareVersionsResponseDto {
  @ApiProperty({
    description: '策略ID',
    example: 'strategy-123',
  })
  strategyId: string;

  @ApiProperty({
    description: '源版本信息',
  })
  sourceVersion: {
    id: string;
    version: string;
    createdAt: string;
  };

  @ApiProperty({
    description: '目标版本信息',
  })
  targetVersion: {
    id: string;
    version: string;
    createdAt: string;
  };

  @ApiProperty({
    description: '对比模式',
    enum: CompareMode,
  })
  mode: CompareMode;

  @ApiProperty({
    description: '代码差异(仅当mode为code或full时存在)',
    required: false,
  })
  codeDiff?: CodeDiffResult;

  @ApiProperty({
    description: 'Schema差异(仅当mode为schema或full时存在)',
    required: false,
  })
  schemaDiff?: SchemaDiffResult;

  @ApiProperty({
    description: '对比时间',
  })
  comparedAt: string;

  @ApiProperty({
    description: '是否有差异',
  })
  hasDifferences: boolean;
}

