import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyScriptsService } from './strategy-scripts.service';
import { StrategyEntity } from '../entities/strategy.entity';
import { StrategyScriptVersionEntity } from '../entities/strategy-script-version.entity';

describe('StrategyScriptsService', () => {
  let service: StrategyScriptsService;
  let strategyRepo: jest.Mocked<Repository<StrategyEntity>>;
  let scriptRepo: jest.Mocked<Repository<StrategyScriptVersionEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StrategyScriptsService,
        {
          provide: getRepositoryToken(StrategyEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StrategyScriptVersionEntity),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              update: () => ({
                set: () => ({
                  where: () => ({
                    andWhere: () => ({ execute: jest.fn() }),
                  }),
                }),
              }),
            })),
            createQueryBuilderForList: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StrategyScriptsService);
    strategyRepo = moduleRef.get(getRepositoryToken(StrategyEntity));
    scriptRepo = moduleRef.get(getRepositoryToken(StrategyScriptVersionEntity));
  });

  it('creates new script with generated version code', async () => {
    strategyRepo.findOne.mockResolvedValue({
      strategyId: 1,
      code: 'demo',
    } as StrategyEntity);
    scriptRepo.findOne.mockResolvedValue(null);
    scriptRepo.create.mockImplementation((payload) => payload as StrategyScriptVersionEntity);
    scriptRepo.save.mockImplementation(async (payload) => ({ scriptId: 10, ...payload } as StrategyScriptVersionEntity));

    const result = await service.createScript(1, {
      scriptSource: 'export default {} as any;',
    });

    expect(result.scriptId).toBe(10);
    expect(result.scriptSource).toContain('export default');
    expect(scriptRepo.save).toHaveBeenCalled();
  });

  it('throws when duplicate version code', async () => {
    strategyRepo.findOne.mockResolvedValue({ strategyId: 1 } as StrategyEntity);
    scriptRepo.findOne.mockResolvedValueOnce({ scriptId: 1 } as StrategyScriptVersionEntity);

    await expect(
      service.createScript(1, {
        versionCode: 'v1',
        scriptSource: 'export default {} as any;',
      }),
    ).rejects.toThrow('脚本版本号已存在');
  });
});
