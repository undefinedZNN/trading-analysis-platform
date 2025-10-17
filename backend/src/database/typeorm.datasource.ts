import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'trading_user',
  password: process.env.DB_PASSWORD ?? 'trading_password',
  database: process.env.DB_NAME ?? 'trading_analysis',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

console.log('dataSourceOptions', dataSourceOptions);

export default new DataSource(dataSourceOptions);
