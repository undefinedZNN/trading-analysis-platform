import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

const dbHost = process.env.DB_HOST ?? process.env.DATABASE_HOST ?? 'localhost';
const dbPort = parseInt(
  process.env.DB_PORT ?? process.env.DATABASE_PORT ?? '5432',
  10,
);
const dbUser = process.env.DB_USER ?? process.env.DATABASE_USER ?? 'trading_user';
const dbPassword =
  process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD ?? 'trading_password';
const dbName = process.env.DB_NAME ?? process.env.DATABASE_NAME ?? 'trading_analysis';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPassword,
  database: dbName,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

// console.log('dataSourceOptions', dataSourceOptions);

export default new DataSource(dataSourceOptions);
