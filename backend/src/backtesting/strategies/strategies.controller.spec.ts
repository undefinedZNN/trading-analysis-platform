import { Test, TestingModule } from '@nestjs/testing';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { ListStrategiesDto } from './dto/list-strategies.dto';

describe('StrategiesController', () => {
  let controller: StrategiesController;
  let service: jest.Mocked<StrategiesService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<StrategiesService>> = {
      listStrategies: jest.fn(),
      listStrategyTags: jest.fn(),
      getStrategy: jest.fn(),
      createStrategy: jest.fn(),
      updateStrategy: jest.fn(),
      createScriptVersion: jest.fn(),
      updateScriptVersion: jest.fn(),
      copyScriptVersion: jest.fn(),
      diffScriptVersions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategiesController],
      providers: [{ provide: StrategiesService, useValue: serviceMock }],
    }).compile();

    controller = module.get(StrategiesController);
    service = module.get(StrategiesService) as jest.Mocked<StrategiesService>;
  });

  it('列表查询调用 service.listStrategies', async () => {
    const dto: ListStrategiesDto = { page: 1, pageSize: 10 };
    service.listStrategies.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const result = await controller.list(dto);

    expect(service.listStrategies).toHaveBeenCalledWith(dto);
    expect(result.items).toEqual([]);
  });

  it('列出标签调用 service.listStrategyTags', async () => {
    service.listStrategyTags.mockResolvedValue(['trend']);

    const result = await controller.listTags();

    expect(service.listStrategyTags).toHaveBeenCalled();
    expect(result).toEqual(['trend']);
  });
});
