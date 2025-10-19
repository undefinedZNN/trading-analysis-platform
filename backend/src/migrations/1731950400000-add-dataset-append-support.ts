import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDatasetAppendSupport1731950400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE imports
      ADD COLUMN IF NOT EXISTS target_dataset_id INTEGER;
    `);

    await queryRunner.query(`
      ALTER TABLE imports
      ADD CONSTRAINT fk_imports_target_dataset
      FOREIGN KEY (target_dataset_id)
      REFERENCES datasets(dataset_id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_imports_target_dataset
      ON imports (target_dataset_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataset_batches (
        dataset_batch_id SERIAL PRIMARY KEY,
        dataset_id INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE ON UPDATE CASCADE,
        import_id INTEGER NOT NULL REFERENCES imports(import_id) ON DELETE CASCADE ON UPDATE CASCADE,
        path TEXT NOT NULL,
        time_start TIMESTAMPTZ NOT NULL,
        time_end TIMESTAMPTZ NOT NULL,
        row_count BIGINT NOT NULL,
        checksum TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dataset_batches_dataset
      ON dataset_batches (dataset_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_dataset_batches_dataset;
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS dataset_batches;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_imports_target_dataset;
    `);
    await queryRunner.query(`
      ALTER TABLE imports
      DROP CONSTRAINT IF EXISTS fk_imports_target_dataset;
    `);
    await queryRunner.query(`
      ALTER TABLE imports
      DROP COLUMN IF EXISTS target_dataset_id;
    `);
  }
}
