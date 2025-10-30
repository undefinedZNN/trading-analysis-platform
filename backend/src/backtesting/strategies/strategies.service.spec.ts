import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategiesService } from './strategies.service';
import { StrategyEntity } from '../entities/strategy.entity';
import { ScriptVersionEntity } from '../entities/script-version.entity';
import { StrategyScriptParser } from './strategy-script.parser';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DiffScriptVersionDto } from './dto/diff-script-version.dto';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  createQueryBuilder?: jest.Mock;
  query?: jest.Mock;
};

  const createMockRepository = (): MockRepository => {
    const qb: any = {
    update: jest.fn(() => qb),
    set: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [[], 0]),
    execute: jest.fn(async () => undefined),
  };

    return {
      create: jest.fn((input) => ({
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      save: jest.fn(async (entity) => entity),
      find: jest.fn(),
      findOne: jest.fn(),
      exist: jest.fn(),
      update: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(),
    };
  };

describe('StrategiesService', () => {
  let service: StrategiesService;
  let strategyRepository: MockRepository<StrategyEntity>;
  let scriptVersionRepository: MockRepository<ScriptVersionEntity>;
  let parser: StrategyScriptParser;

  const parserResult = {
    parameters: [
      { key: 'shortWindow', label: '短期', type: 'number', component: 'number' },
    ],
    factors: [
      { key: 'holdingBars', label: '持仓K线数', type: 'number', component: 'number' },
    ],
  };

  beforeEach(async () => {
    const savedVersions: ScriptVersionEntity[] = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategiesService,
        {
          provide: getRepositoryToken(StrategyEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(ScriptVersionEntity),
          useValue: createMockRepository(),
        },
        {
          provide: StrategyScriptParser,
          useValue: { parse: jest.fn().mockReturnValue(parserResult) },
        },
      ],
    }).compile();

    service = module.get(StrategiesService);
    strategyRepository = module.get(
      getRepositoryToken(StrategyEntity),
    ) as MockRepository<StrategyEntity>;
    scriptVersionRepository = module.get(
      getRepositoryToken(ScriptVersionEntity),
    ) as MockRepository<ScriptVersionEntity>;
    parser = module.get(StrategyScriptParser);

    strategyRepository.save!.mockImplementation(async (entity) => {
      const persisted = entity as StrategyEntity;
      persisted.strategyId = persisted.strategyId ?? 'strategy-1';
      persisted.createdAt = new Date();
      persisted.updatedAt = new Date();
      return persisted;
    });

    scriptVersionRepository.save!.mockImplementation(async (entity) => {
      const draft = entity as ScriptVersionEntity;
      draft.scriptVersionId =
        draft.scriptVersionId ?? `version-${savedVersions.length + 1}`;
      draft.createdAt = new Date();
      draft.updatedAt = new Date();
      const saved = { ...draft } as ScriptVersionEntity;
      savedVersions.push(saved);
      return saved;
    });

    scriptVersionRepository.find!.mockImplementation(async () => savedVersions);
    scriptVersionRepository.findOne!.mockImplementation(async (options?: any) => {
      if (!options) {
        return savedVersions[0] ?? null;
      }
      const where = options.where ?? options;
      return (
        savedVersions.find((item) => {
          return Object.entries(where).every(
            ([key, value]) => (item as any)[key] === value,
          );
        }) ?? null
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('创建策略时生成初始脚本版本并设置 master', async () => {
    strategyRepository.findOne!
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        strategyId: 'strategy-1',
        name: '均线策略',
        description: null,
        tags: [],
        defaultScriptVersionId: 'version-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as StrategyEntity);

    const result = await service.createStrategy({
      name: '均线策略',
      description: '测试策略',
      tags: ['趋势'],
      initialVersion: {
        code: 'export default {} as any',
      },
    });

    expect(parser.parse).toHaveBeenCalledWith('export default {} as any');
    expect(scriptVersionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isMaster: true }),
    );
    const updateCall = strategyRepository.update!.mock.calls.pop();
    expect(updateCall?.[0]).toBe('strategy-1');
    expect(updateCall?.[1]).toEqual({
      defaultScriptVersionId: 'version-1',
    });
    expect(result.scriptVersions).toHaveLength(1);
    expect(result.scriptVersions[0].parameterSchema).toEqual(
      parserResult.parameters,
    );
  });

  it('策略名称重复时抛出异常', async () => {
    strategyRepository.findOne!.mockResolvedValue({
      strategyId: 'existing',
      name: '重复策略',
    } as StrategyEntity);

    await expect(
      service.createStrategy({
        name: '重复策略',
        initialVersion: { code: 'code' },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('创建脚本版本时校验重名并可切换 master', async () => {
    strategyRepository.exist!.mockResolvedValue(true);
    scriptVersionRepository.find!.mockResolvedValueOnce([
      {
        scriptVersionId: 'version-1',
        strategyId: 'strategy-1',
        versionName: 'v20240101.1',
        isMaster: true,
        code: 'code',
        parameterSchema: parserResult.parameters,
        factorSchema: parserResult.factors,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ScriptVersionEntity,
    ]);
    strategyRepository.findOne!.mockResolvedValue({
      strategyId: 'strategy-1',
      name: '均线策略',
      description: null,
      tags: [],
      defaultScriptVersionId: 'version-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyEntity);

    const qb: any = {
      update: jest.fn(() => qb),
      set: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      execute: jest.fn(async () => undefined),
    };
    scriptVersionRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.createScriptVersion('strategy-1', {
      versionName: 'v20240101.2',
      code: 'export default {} as any',
      isMaster: true,
    });

    expect(parser.parse).toHaveBeenCalledWith('export default {} as any');
    const lastUpdate = strategyRepository.update!.mock.calls.at(-1);
    expect(lastUpdate?.[0]).toBe('strategy-1');
    expect(lastUpdate?.[1]).toHaveProperty('defaultScriptVersionId');
    expect(qb.execute).toHaveBeenCalled();
  });

  it('创建脚本版本遇到重名时抛出异常', async () => {
    strategyRepository.exist!.mockResolvedValue(true);
    scriptVersionRepository.find!.mockResolvedValue([
      {
        scriptVersionId: 'version-1',
        strategyId: 'strategy-1',
        versionName: 'v20240101.1',
      } as ScriptVersionEntity,
    ]);

    await expect(
      service.createScriptVersion('strategy-1', {
        versionName: 'v20240101.1',
        code: 'export default {} as any',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('更新脚本版本代码时重新解析 Schema', async () => {
    strategyRepository.findOne!.mockResolvedValue({
      strategyId: 'strategy-1',
      name: '均线策略',
      description: null,
      tags: [],
      defaultScriptVersionId: 'version-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyEntity);
    scriptVersionRepository.findOne!.mockResolvedValue({
      scriptVersionId: 'version-1',
      strategyId: 'strategy-1',
      versionName: 'v20240101.1',
      isMaster: false,
      code: 'old',
      parameterSchema: [],
      factorSchema: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ScriptVersionEntity);

    await service.updateScriptVersion('strategy-1', 'version-1', {
      code: 'export default {} as any',
      setMaster: true,
    });

    expect(parser.parse).toHaveBeenCalledWith('export default {} as any');
    expect(scriptVersionRepository.update).toHaveBeenCalledWith(
      'version-1',
      expect.objectContaining({ code: 'export default {} as any' }),
    );
  });

  it('复制脚本版本时继承源码并生成新版本号', async () => {
    strategyRepository.findOne!.mockResolvedValue({
      strategyId: 'strategy-1',
      name: '均线策略',
      description: null,
      tags: [],
      defaultScriptVersionId: 'version-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyEntity);
    scriptVersionRepository.findOne!.mockResolvedValue({
      scriptVersionId: 'version-1',
      strategyId: 'strategy-1',
      versionName: 'v20240101.1',
      isMaster: true,
      code: 'source code',
      parameterSchema: parserResult.parameters,
      factorSchema: parserResult.factors,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ScriptVersionEntity);
    scriptVersionRepository.find!.mockResolvedValue([
      {
        scriptVersionId: 'version-1',
        strategyId: 'strategy-1',
        versionName: 'v20240101.1',
      } as ScriptVersionEntity,
    ]);

    await service.copyScriptVersion('strategy-1', 'version-1', {
      remark: '复制',
      createdBy: 'tester',
    });

    expect(scriptVersionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        remark: '复制',
        code: 'source code',
      }),
    );
  });

  it('复制不存在的版本时抛出异常', async () => {
    scriptVersionRepository.findOne!.mockResolvedValue(null as any);

    await expect(
      service.copyScriptVersion('strategy-1', 'not-exist', {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('计算脚本版本 diff', async () => {
    strategyRepository.findOne!.mockResolvedValue({
      strategyId: 'strategy-1',
      name: '均线策略',
      description: null,
      tags: [],
      defaultScriptVersionId: 'version-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyEntity);

    scriptVersionRepository.findOne!.mockImplementation(async ({
      where,
    }: any) => {
      if (where.scriptVersionId === 'version-1') {
        return {
          scriptVersionId: 'version-1',
          strategyId: 'strategy-1',
          versionName: 'v1',
          isMaster: true,
          code: 'line1\nline2',
          parameterSchema: [{ key: 'p1', label: 'P1' }],
          factorSchema: [{ key: 'f1', label: 'F1' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ScriptVersionEntity;
      }
      if (where.scriptVersionId === 'version-2') {
        return {
          scriptVersionId: 'version-2',
          strategyId: 'strategy-1',
          versionName: 'v2',
          isMaster: false,
          code: 'line1\nline3',
          parameterSchema: [{ key: 'p1', label: 'P1 new' }],
          factorSchema: [{ key: 'f2', label: 'F2' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ScriptVersionEntity;
      }
      return null as any;
    });

    const result = await service.diffScriptVersions(
      'strategy-1',
      'version-1',
      { compareVersionId: 'version-2' } as DiffScriptVersionDto,
    );

    expect(result.baseVersion.versionName).toBe('v1');
    expect(result.compareVersion.versionName).toBe('v2');
    expect(result.codeDiff).toHaveLength(3);
    expect(result.parameterDiff.changed).toHaveLength(1);
    expect(result.factorDiff.added).toHaveLength(1);
    expect(result.factorDiff.removed).toHaveLength(1);
  });

  it('列出策略标签', async () => {
    strategyRepository.query!.mockResolvedValue([
      { tag: 'trend' },
      { tag: 'momentum' },
      { tag: null },
    ]);

    const result = await service.listStrategyTags();

    expect(result).toEqual(['momentum', 'trend']);
  });
});
