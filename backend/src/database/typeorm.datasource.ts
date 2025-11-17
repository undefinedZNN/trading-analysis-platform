import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

const entitiesPath = [join(__dirname, '..', '**', '*.entity.{ts,js}')];
const migrationsPath = [join(__dirname, '..', 'migrations', '*.{ts,js}')];

const dbType = (process.env.DB_TYPE ?? '').toLowerCase();
const useSqlite =
  dbType === 'sqlite' ||
  (process.env.DB_USE_SQLITE ?? '').toLowerCase() === 'true';

const sqlitePath =
  process.env.DB_SQLITE_PATH ?? join(process.cwd(), 'sqlite', 'dev.sqlite');

if (useSqlite) {
  const dir = dirname(sqlitePath);
  mkdirSync(dir, { recursive: true });
}

const dbHost = process.env.DB_HOST ?? process.env.DATABASE_HOST ?? 'localhost';
const dbPort = parseInt(
  process.env.DB_PORT ?? process.env.DATABASE_PORT ?? '5432',
  10,
);
const dbUser = process.env.DB_USER ?? process.env.DATABASE_USER ?? 'trading_user';
const dbPassword =
  process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD ?? 'trading_password';
const dbName = process.env.DB_NAME ?? process.env.DATABASE_NAME ?? 'trading_analysis';

const baseLogging = process.env.TYPEORM_LOGGING === 'true';

export const dataSourceOptions: DataSourceOptions = useSqlite
  ? {
      type: 'sqlite',
      database: sqlitePath,
      entities: entitiesPath,
      migrations: migrationsPath,
      synchronize: true,
      logging: baseLogging,
    }
  : {
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
      entities: entitiesPath,
      migrations: migrationsPath,
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
      logging: baseLogging,
    };

// console.log('dataSourceOptions', dataSourceOptions);

export default new DataSource(dataSourceOptions);
