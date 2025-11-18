import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompiledCodeColumn1763496000000 implements MigrationInterface {
  name = 'AddCompiledCodeColumn1763496000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "script_versions" ADD "compiled_code" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "script_versions" ADD "compiled_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "script_versions" DROP COLUMN "compiled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "script_versions" DROP COLUMN "compiled_code"`,
    );
  }
}
