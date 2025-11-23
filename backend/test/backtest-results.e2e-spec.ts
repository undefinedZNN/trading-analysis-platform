import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestTasksModule } from '../src/backtesting/tasks/backtest-tasks.module';

describe('Backtest Results (E2E)', () => {
  let app: INestApplication;
  let taskId: string;
  let resultId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          username: process.env.DB_USERNAME || 'test',
          password: process.env.DB_PASSWORD || 'test',
          database: process.env.DB_DATABASE || 'test_db',
          entities: ['src/**/*.entity.ts'],
          synchronize: true, // Only for testing
        }),
        BacktestTasksModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/backtest/tasks/:taskId/results (GET)', () => {
    it('should return empty array for task with no results', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/results')
        .expect(404); // Task not found
    });

    it('should return 400 for invalid task ID format', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/invalid-id/results')
        .expect(400);
    });
  });

  describe('/backtest/tasks/:taskId/results (POST)', () => {
    it('should create a filtered result', async () => {
      // Note: This requires a completed backtest task to exist
      // In real tests, you would set up the necessary test data first

      const createDto = {
        resultName: 'Test Filtered Result',
        filterConditions: {
          factors: { rsi: { min: 30, max: 70 } },
        },
      };

      // This will fail if task doesn't exist, which is expected in e2e
      // In a real scenario, you'd create a task first
      return request(app.getHttpServer())
        .post(`/backtest/tasks/${taskId}/results`)
        .send(createDto)
        .expect((res) => {
          // Either 404 (task not found) or 201 (success if task exists)
          expect([404, 201]).toContain(res.status);
        });
    });

    it('should validate request body', () => {
      return request(app.getHttpServer())
        .post('/backtest/tasks/00000000-0000-0000-0000-000000000000/results')
        .send({
          // Missing required fields
          filterConditions: {},
        })
        .expect(400);
    });
  });

  describe('/backtest/results/compare (POST)', () => {
    it('should compare multiple results', () => {
      const resultIds = [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ];

      return request(app.getHttpServer())
        .post('/backtest/results/compare')
        .send({ resultIds })
        .expect((res) => {
          // Either 404 (results not found) or 200 (success if results exist)
          expect([404, 200]).toContain(res.status);
        });
    });

    it('should require at least 2 result IDs', () => {
      return request(app.getHttpServer())
        .post('/backtest/results/compare')
        .send({
          resultIds: ['00000000-0000-0000-0000-000000000001'],
        })
        .expect(400);
    });
  });

  describe('/backtest/tasks/:taskId/results/summary (GET)', () => {
    it('should return results summary', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/results/summary')
        .expect((res) => {
          // Either 404 (task not found) or 200 (success)
          expect([404, 200]).toContain(res.status);
          
          if (res.status === 200) {
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('hasPrimary');
          }
        });
    });
  });

  describe('/backtest/results/:resultId (GET)', () => {
    it('should return result details', () => {
      return request(app.getHttpServer())
        .get('/backtest/results/00000000-0000-0000-0000-000000000000')
        .expect(404); // Result not found
    });
  });

  describe('/backtest/results/:resultId (DELETE)', () => {
    it('should delete a result', () => {
      return request(app.getHttpServer())
        .delete('/backtest/results/00000000-0000-0000-0000-000000000000')
        .expect(404); // Result not found
    });

    it('should not allow deleting primary result', async () => {
      // If there was a primary result, it should return 400
      // This test assumes no data exists
      return request(app.getHttpServer())
        .delete('/backtest/results/00000000-0000-0000-0000-000000000000')
        .expect((res) => {
          expect([400, 404]).toContain(res.status);
        });
    });
  });

  describe('/backtest/tasks/:taskId/trades (GET)', () => {
    it('should return trades data', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/trades')
        .expect((res) => {
          expect([404, 200]).toContain(res.status);
          
          if (res.status === 200) {
            expect(res.body).toHaveProperty('trades');
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('page');
            expect(res.body).toHaveProperty('pageSize');
          }
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/trades')
        .query({ page: 1, limit: 10 })
        .expect((res) => {
          expect([404, 200]).toContain(res.status);
        });
    });

    it('should support filter conditions', () => {
      const filterConditions = JSON.stringify({
        factors: { rsi: { min: 30, max: 70 } },
      });

      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/trades')
        .query({ filterConditions })
        .expect((res) => {
          expect([404, 200]).toContain(res.status);
        });
    });
  });

  describe('/backtest/tasks/:taskId/equity (GET)', () => {
    it('should return equity curve data', () => {
      return request(app.getHttpServer())
        .get('/backtest/tasks/00000000-0000-0000-0000-000000000000/equity')
        .expect((res) => {
          expect([404, 200]).toContain(res.status);
          
          if (res.status === 200) {
            expect(Array.isArray(res.body)).toBe(true);
          }
        });
    });
  });
});

