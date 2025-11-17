import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssignedWorkerColumns1763365626466 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
          ALTER TABLE backtest_tasks
          ADD COLUMN IF NOT EXISTS assigned_worker_id varchar(128),
          ADD COLUMN IF NOT EXISTS metrics_snapshot jsonb
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
          ALTER TABLE backtest_tasks
          DROP COLUMN IF EXISTS metrics_snapshot,
          DROP COLUMN IF EXISTS assigned_worker_id
        `);
    }

}
