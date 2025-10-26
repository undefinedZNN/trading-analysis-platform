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
    const strategy = this.strategyRepo.create({
      name: payload.name.trim(),
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
      qb.andWhere('(strategy.name ILIKE :keyword)', {
        keyword: `%${query.keyword.trim()}%`,
      });
    }

    if (query.tags && query.tags.length > 0) {
      qb.andWhere('strategy.tags && :tags', { tags: query.tags });
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
