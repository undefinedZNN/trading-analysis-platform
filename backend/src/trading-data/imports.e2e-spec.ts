import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { join } from 'path';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { createServer } from 'http';
import { ImportsController } from './controllers/imports.controller';
import { TradingDataService } from './trading-data.service';
import { DatasetEntity } from './entities/dataset.entity';
import { ImportTaskEntity, ImportStatus } from './entities/import-task.entity';
import { ImportProcessingService } from './services/import-processing.service';

type MockRepository<T = any> = Partial<Record<keyof T, jest.Mock>> & {
  create?: jest.Mock;
  save?: jest.Mock;
};

async function probeLoopbackAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    const onListening = () => {
      server.close(() => resolve(true));
    };
    const onError = () => {
      resolve(false);
    };
    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(0, '127.0.0.1');
  });
}

describe('ImportsController (upload integration)', () => {
  let supertestEnabled = true;
let app: INestApplication | null;
  let importRepository: MockRepository;
  let processingService: { scheduleProcessing: jest.Mock };
let rawUploadsRoot: string;
let datasetsRoot: string;
  let importIdSeq = 1;

  beforeAll(async () => {
    supertestEnabled = await probeLoopbackAccess();
    rawUploadsRoot = mkdtempSync(join(tmpdir(), 'raw_uploads_'));
    datasetsRoot = mkdtempSync(join(tmpdir(), 'datasets_'));
    process.env.RAW_UPLOADS_ROOT = rawUploadsRoot;
    process.env.DATASETS_ROOT = datasetsRoot;
  });

  afterAll(() => {
    rmSync(rawUploadsRoot, { recursive: true, force: true });
    rmSync(datasetsRoot, { recursive: true, force: true });
    delete process.env.RAW_UPLOADS_ROOT;
    delete process.env.DATASETS_ROOT;
  });

  let datasetSeq = 1;

  beforeEach(async () => {
    if (!supertestEnabled) {
      return;
    }
    let lastSavedTask: ImportTaskEntity | null = null;

    importRepository = {
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn(async (entity) => {
        const saved = {
          importId: importIdSeq++,
          status: entity.status ?? ImportStatus.Pending,
          progress: entity.progress ?? 0,
          createdBy: entity.createdBy ?? null,
          updatedBy: entity.updatedBy ?? null,
          ...entity,
        } as ImportTaskEntity;
        lastSavedTask = saved;
        return saved;
      }),
      update: jest.fn().mockImplementation(async (_criteria, partial) => {
        if (lastSavedTask) {
          lastSavedTask = {
            ...lastSavedTask,
            ...(partial as Partial<ImportTaskEntity>),
          } as ImportTaskEntity;
        }
      }),
      findOneOrFail: jest
        .fn()
        .mockImplementation(async ({ where: { importId } }) => {
          if (lastSavedTask && lastSavedTask.importId === importId) {
            return lastSavedTask;
          }
          throw new Error('Import not found');
        }),
    };

    const datasetRepository: MockRepository = {
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn(async (entity) => ({ datasetId: datasetSeq++, ...entity })),
    };

    processingService = {
      scheduleProcessing: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        TradingDataService,
        {
          provide: getRepositoryToken(DatasetEntity),
          useValue: datasetRepository,
        },
        {
          provide: getRepositoryToken(ImportTaskEntity),
          useValue: importRepository,
        },
        {
          provide: ImportProcessingService,
          useValue: processingService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    app = null;
  });

  it('应当保存上传文件并写入 raw_uploads 目录', async () => {
    if (!supertestEnabled) {
      console.warn('supertest 集成测试已跳过：当前环境禁止回环端口访问');
      return;
    }

    if (!app) {
      throw new Error('Nest application 未初始化');
    }

    const fileContent = 'timestamp,open,high,low,close,volume\n';

    const handler = app.getHttpAdapter().getInstance();
    const server = createServer(handler as any);
    (server as any).listen = (port: any, ...args: any[]) => {
      const callback = typeof port === 'function' ? port : args[0];
      if (typeof callback === 'function') {
        callback();
      }
      return server;
    };
    (server as any).address = () => ({ port: 0 });

    const response = await request(server)
      .post('/trading-data/imports')
      .field('pluginName', 'CsvOhlcvPlugin')
      .field('pluginVersion', '1.0.0')
      .field(
        'metadata',
        JSON.stringify({
          tradingPair: 'BTC/USDT',
          granularity: '1m',
          source: 'binance',
        }),
      )
      .attach('file', Buffer.from(fileContent), 'ohlcv.csv')
      .expect(201);

    const body = response.body;
    expect(body).toHaveProperty('importId');
    expect(body).toHaveProperty('storedFilePath');

    const expectedPath = join(rawUploadsRoot, `${body.importId}`, 'ohlcv.csv');
    expect(existsSync(expectedPath)).toBe(true);

    expect(processingService.scheduleProcessing).toHaveBeenCalledTimes(1);
    const [taskArg, metadataArg] =
      processingService.scheduleProcessing.mock.calls[0];
    expect(taskArg.importId).toBe(body.importId);
    expect(metadataArg).toMatchObject({
      tradingPair: 'BTC/USDT',
      granularity: '1m',
    });
  });
});
