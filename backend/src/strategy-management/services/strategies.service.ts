import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyEntity } from '../entities/strategy.entity';
import {
  CreateStrategyDto,
  ListStrategiesQueryDto,
  UpdateStrategyDto,
} from '../dto/strategy.dto';

export interface PaginatedStrategiesResult {
  items: StrategyEntity[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class StrategiesService {
  constructor(
    @InjectRepository(StrategyEntity)
    private readonly strategyRepo: Repository<StrategyEntity>,
  ) {}

  async createStrategy(payload: CreateStrategyDto): Promise<StrategyEntity> {
    const existing = await this.strategyRepo.findOne({
      where: { code: payload.code },
      withDeleted: true,
    });
    if (existing) {
      throw new BadRequestException('策略编码已存在，请更换后重试');
    }

    const strategy = this.strategyRepo.create({
      code: payload.code.trim(),
      name: payload.name.trim(),
      team: payload.team?.trim() ?? null,
      markets: payload.markets,
      frequency: payload.frequency?.trim() ?? null,
      tags: Array.from(new Set(payload.tags)),
      description: payload.description?.trim() ?? null,
      createdBy: payload.createdBy ?? null,
      updatedBy: payload.createdBy ?? null,
    });

    return this.strategyRepo.save(strategy);
  }

  async listStrategies(
    query: ListStrategiesQueryDto,
  ): Promise<PaginatedStrategiesResult> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const qb = this.strategyRepo
      .createQueryBuilder('strategy')
      .where('strategy.deletedAt IS NULL');

    if (query.keyword) {
      qb.andWhere(
        '(strategy.name ILIKE :keyword OR strategy.code ILIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }

    if (query.tags && query.tags.length > 0) {
      qb.andWhere('strategy.tags && :tags', { tags: query.tags });
    }

    if (query.markets && query.markets.length > 0) {
      qb.andWhere('strategy.markets && :markets', { markets: query.markets });
    }

    qb.orderBy('strategy.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async getStrategyById(strategyId: number): Promise<StrategyEntity> {
    const strategy = await this.strategyRepo.findOne({
      where: { strategyId },
      relations: { scriptVersions: true },
    });
    if (!strategy) {
      throw new NotFoundException('策略不存在或已被删除');
    }
    return strategy;
  }

  async updateStrategy(
    strategyId: number,
    payload: UpdateStrategyDto,
  ): Promise<StrategyEntity> {
    const strategy = await this.strategyRepo.findOne({
      where: { strategyId },
    });
    if (!strategy) {
      throw new NotFoundException('策略不存在或已被删除');
    }

    if (payload.name !== undefined) {
      strategy.name = payload.name.trim();
    }
    if (payload.team !== undefined) {
      strategy.team = payload.team?.trim() ?? null;
    }
    if (payload.markets !== undefined) {
      strategy.markets = payload.markets;
    }
    if (payload.frequency !== undefined) {
      strategy.frequency = payload.frequency?.trim() ?? null;
    }
    if (payload.tags !== undefined) {
      strategy.tags = Array.from(new Set(payload.tags));
    }
    if (payload.description !== undefined) {
      strategy.description = payload.description?.trim() ?? null;
    }
    strategy.updatedBy = payload.updatedBy ?? strategy.updatedBy;

    return this.strategyRepo.save(strategy);
  }

  async softDeleteStrategy(strategyId: number, operator?: string): Promise<void> {
    const strategy = await this.strategyRepo.findOne({
      where: { strategyId },
    });
    if (!strategy) {
      throw new NotFoundException('策略不存在或已被删除');
    }
    strategy.updatedBy = operator ?? strategy.updatedBy;
    await this.strategyRepo.save(strategy);
    await this.strategyRepo.softDelete(strategyId);
  }
}
