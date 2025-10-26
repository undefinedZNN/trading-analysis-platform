import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyStrategyEntity1732570000000 implements MigrationInterface {
  name = 'SimplifyStrategyEntity1732570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 移除不再需要的字段
    await queryRunner.query(`
      ALTER TABLE "strategies" 
      DROP COLUMN IF EXISTS "code",
      DROP COLUMN IF EXISTS "team",
      DROP COLUMN IF EXISTS "markets",
      DROP COLUMN IF EXISTS "frequency"
    `);

    // 更新 tags 列的注释
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."tags" IS '策略标签集合，用于分类检索'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 恢复删除的字段
    await queryRunner.query(`
      ALTER TABLE "strategies" 
      ADD COLUMN "code" text UNIQUE,
      ADD COLUMN "team" text,
      ADD COLUMN "markets" text[] DEFAULT ARRAY[]::text[],
      ADD COLUMN "frequency" text
    `);

    // 恢复原注释
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."code" IS '策略唯一编码，便于 API/CLI 调用'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."team" IS '归属团队或小组'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."markets" IS '适用市场或标的标签集合'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."frequency" IS '交易频率，如 1m、5m、1d'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "strategies"."tags" IS '策略标签集合'
    `);
  }
}

