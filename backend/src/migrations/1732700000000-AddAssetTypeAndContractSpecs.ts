import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

/**
 * 添加资产类型和合约规格字段到 datasets 表
 * 
 * 新增字段：
 * - asset_type: 资产类型（stock, futures, crypto, forex）
 * - contract_specs: 合约规格（JSONB）
 */
export class AddAssetTypeAndContractSpecs1732700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 添加 asset_type 列
    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'asset_type',
        type: 'text',
        isNullable: false,
        default: "'crypto'",
        comment: '资产类型：stock（股票）、futures（期货）、crypto（加密货币）、forex（外汇）',
      })
    );

    // 2. 添加 contract_specs 列
    await queryRunner.addColumn(
      'datasets',
      new TableColumn({
        name: 'contract_specs',
        type: 'jsonb',
        isNullable: true,
        comment: '合约规格（期货必填）：multiplier（合约乘数）、tickSize（最小变动价位）、marginRatio（保证金比例）、lotSize（最小交易单位）、currency（计价货币）',
      })
    );

    // 3. 创建索引以提高查询性能
    await queryRunner.createIndex(
      'datasets',
      new TableIndex({
        name: 'idx_datasets_asset_type',
        columnNames: ['asset_type'],
      })
    );

    console.log('✅ Added asset_type and contract_specs columns to datasets table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：删除索引和列
    await queryRunner.dropIndex('datasets', 'idx_datasets_asset_type');
    await queryRunner.dropColumn('datasets', 'contract_specs');
    await queryRunner.dropColumn('datasets', 'asset_type');

    console.log('✅ Removed asset_type and contract_specs columns from datasets table');
  }
}

