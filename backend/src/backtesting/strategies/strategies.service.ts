import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StrategyEntity } from '../entities/strategy.entity';
import { ScriptVersionEntity } from '../entities/script-version.entity';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { CreateScriptVersionDto } from './dto/create-script-version.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { UpdateScriptVersionDto } from './dto/update-script-version.dto';
import { ListStrategiesDto } from './dto/list-strategies.dto';
import { CopyScriptVersionDto } from './dto/copy-script-version.dto';
import { generateVersionName } from '../utils/version.util';
import { StrategyScriptParser } from './strategy-script.parser';
import { diffLines, diffFieldArray } from '../utils/diff.util';
import { DiffScriptVersionDto } from './dto/diff-script-version.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class StrategiesService {
  constructor(
    @InjectRepository(StrategyEntity)
    private readonly strategyRepository: Repository<StrategyEntity>,
    @InjectRepository(ScriptVersionEntity)
    private readonly scriptVersionRepository: Repository<ScriptVersionEntity>,
    private readonly scriptParser: StrategyScriptParser,
  ) {}

  async listStrategies(query: ListStrategiesDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const qb = this.strategyRepository.createQueryBuilder('strategy');

    if (query.keyword) {
      qb.andWhere('strategy.name ILIKE :keyword', {
        keyword: `%${query.keyword}%`,
      });
    }

    if (query.tags?.length) {
      qb.andWhere('strategy.tags @> :tags::jsonb', {
        tags: JSON.stringify(query.tags),
      });
    }

    qb.orderBy('strategy.updated_at', 'DESC');
    qb.skip((page - 1) * pageSize);
    qb.take(pageSize);

    const [strategies, total] = await qb.getManyAndCount();

    if (strategies.length === 0) {
      return {
        items: [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    const strategyIds = strategies.map((item) => item.strategyId);
    const versions = await this.scriptVersionRepository.find({
      where: {
        strategyId: In(strategyIds),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const versionMap = new Map<string, ScriptVersionEntity[]>();
    for (const version of versions) {
      const list = versionMap.get(version.strategyId) ?? [];
      list.push(version);
      versionMap.set(version.strategyId, list);
    }

    const items = strategies.map((strategy) => {
      const list = versionMap.get(strategy.strategyId) ?? [];
      const master = list.find((version) => version.isMaster);
      const latest = list[0];
      return {
        strategyId: strategy.strategyId,
        name: strategy.name,
        description: strategy.description,
        tags: strategy.tags ?? [],
        defaultScriptVersionId: strategy.defaultScriptVersionId,
        createdAt: strategy.createdAt,
        updatedAt: strategy.updatedAt,
        masterVersion: master
          ? this.toVersionSummary(master)
          : null,
        latestVersion: latest
          ? this.toVersionSummary(latest)
          : null,
        versionsCount: list.length,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listStrategyTags() {
    const rows: Array<{ tag: string | null }> = await this.strategyRepository.query(
      `SELECT DISTINCT UNNEST(tags) AS tag FROM strategies WHERE cardinality(tags) > 0 ORDER BY tag ASC`,
    );
    const tags = rows
      .map((row) => (row?.tag ?? '').trim())
      .filter((tag) => tag.length > 0);
    const unique = Array.from(new Set(tags));
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  private toVersionSummary(version: ScriptVersionEntity) {
    return {
      scriptVersionId: version.scriptVersionId,
      versionName: version.versionName,
      isMaster: version.isMaster,
      updatedAt: version.updatedAt,
      createdAt: version.createdAt,
      remark: version.remark,
      code: version.code,
      parameterSchema: version.parameterSchema,
      factorSchema: version.factorSchema,
      lastReferencedAt: version.lastReferencedAt,
    };
  }

  async getStrategy(strategyId: string) {
    const strategy = await this.strategyRepository.findOne({
      where: { strategyId },
    });
    if (!strategy) {
      throw new NotFoundException('策略不存在');
    }

    const versions = await this.scriptVersionRepository.find({
      where: { strategyId },
      order: { createdAt: 'DESC' },
    });

    return {
      strategyId: strategy.strategyId,
      name: strategy.name,
      description: strategy.description,
      tags: strategy.tags ?? [],
      defaultScriptVersionId: strategy.defaultScriptVersionId,
      createdAt: strategy.createdAt,
      updatedAt: strategy.updatedAt,
      scriptVersions: versions.map((version) => ({
        scriptVersionId: version.scriptVersionId,
        versionName: version.versionName,
        isMaster: version.isMaster,
        remark: version.remark,
        code: version.code,
        parameterSchema: version.parameterSchema,
        factorSchema: version.factorSchema,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        lastReferencedAt: version.lastReferencedAt,
      })),
    };
  }

  async createStrategy(dto: CreateStrategyDto) {
    await this.ensureStrategyNameUnique(dto.name);

    const strategy = this.strategyRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      tags: dto.tags ?? [],
      createdBy: dto.createdBy ?? null,
      updatedBy: dto.updatedBy ?? dto.createdBy ?? null,
    });
    await this.strategyRepository.save(strategy);

    await this.createVersionInternal(
      strategy.strategyId,
      dto.initialVersion,
      true,
    );

    return this.getStrategy(strategy.strategyId);
  }

  async updateStrategy(strategyId: string, dto: UpdateStrategyDto) {
    const strategy = await this.strategyRepository.findOne({
      where: { strategyId },
    });
    if (!strategy) {
      throw new NotFoundException('策略不存在');
    }

    const tags = dto.tags ?? strategy.tags ?? [];
    if (tags.length > 6) {
      throw new BadRequestException('策略标签最多 6 个');
    }

    await this.strategyRepository.update(strategyId, {
      description: dto.description ?? null,
      tags,
      updatedBy: dto.updatedBy ?? strategy.updatedBy ?? null,
    });

    return this.getStrategy(strategyId);
  }

  async createScriptVersion(
    strategyId: string,
    dto: CreateScriptVersionDto,
  ) {
    await this.assertStrategyExists(strategyId);

    const strategyVersions =
      await this.scriptVersionRepository.find({
        where: { strategyId },
        select: {
          versionName: true,
          scriptVersionId: true,
          isMaster: true,
        },
      });

    const existingNames = strategyVersions.map(
      (item) => item.versionName,
    );
    const versionName =
      dto.versionName?.trim() ||
      generateVersionName(existingNames);

    if (existingNames.includes(versionName)) {
      throw new ConflictException('版本号已存在，请更换');
    }

    const version = await this.createVersionInternal(
      strategyId,
      { ...dto, versionName },
      dto.isMaster ?? false,
    );

    if (dto.isMaster) {
      await this.setMasterVersion(strategyId, version.scriptVersionId);
    }

    return this.getStrategy(strategyId);
  }

  async updateScriptVersion(
    strategyId: string,
    scriptVersionId: string,
    dto: UpdateScriptVersionDto,
  ) {
    const version = await this.scriptVersionRepository.findOne({
      where: { scriptVersionId, strategyId },
    });
    if (!version) {
      throw new NotFoundException('脚本版本不存在');
    }

    const updatePayload: Partial<ScriptVersionEntity> = {};

    if (dto.code) {
      const schemas = this.scriptParser.parse(dto.code);
      updatePayload.code = dto.code;
      updatePayload.parameterSchema = schemas.parameters;
      updatePayload.factorSchema = schemas.factors;
    }

    if (dto.versionName) {
      const exists = await this.scriptVersionRepository.findOne({
        where: {
          strategyId,
          versionName: dto.versionName,
        },
      });
      if (exists && exists.scriptVersionId !== scriptVersionId) {
        throw new ConflictException('版本号已存在，请更换');
      }
      updatePayload.versionName = dto.versionName;
    }

    if (dto.remark !== undefined) {
      updatePayload.remark = dto.remark;
    }

    if (dto.updatedBy !== undefined) {
      updatePayload.updatedBy = dto.updatedBy;
    }

    await this.scriptVersionRepository.update(
      scriptVersionId,
      updatePayload,
    );

    if (dto.setMaster) {
      await this.setMasterVersion(strategyId, scriptVersionId);
    }

    return this.getStrategy(strategyId);
  }

  async copyScriptVersion(
    strategyId: string,
    scriptVersionId: string,
    dto: CopyScriptVersionDto,
  ) {
    const source = await this.scriptVersionRepository.findOne({
      where: { scriptVersionId, strategyId },
    });
    if (!source) {
      throw new NotFoundException('脚本版本不存在');
    }

    const existingVersions =
      await this.scriptVersionRepository.find({
        where: { strategyId },
        select: { versionName: true },
      });

    const versionName =
      dto.versionName?.trim() ||
      generateVersionName(existingVersions.map((v) => v.versionName));

    if (
      existingVersions.some(
        (item) => item.versionName === versionName,
      )
    ) {
      throw new ConflictException('版本号已存在，请更换');
    }

    await this.createVersionInternal(
      strategyId,
      {
        versionName,
        code: source.code,
        remark: dto.remark ?? source.remark,
        createdBy: dto.createdBy ?? source.createdBy,
        updatedBy: dto.createdBy ?? source.createdBy,
      },
      false,
    );

    return this.getStrategy(strategyId);
  }

  async diffScriptVersions(
    strategyId: string,
    scriptVersionId: string,
    query: DiffScriptVersionDto,
  ) {
    const base = await this.scriptVersionRepository.findOne({
      where: { strategyId, scriptVersionId },
    });
    if (!base) {
      throw new NotFoundException('脚本版本不存在');
    }

    let compare: ScriptVersionEntity | null = null;
    if (query.compareVersionId) {
      compare = await this.scriptVersionRepository.findOne({
        where: {
          strategyId,
          scriptVersionId: query.compareVersionId,
        },
      });
    } else if (query.compareVersionName) {
      compare = await this.scriptVersionRepository.findOne({
        where: { strategyId, versionName: query.compareVersionName },
      });
    }

    if (!compare) {
      throw new BadRequestException('请提供有效的对比版本');
    }

    const codeDiff = diffLines(base.code ?? '', compare.code ?? '');
    const parameterDiff = diffFieldArray(
      base.parameterSchema as any[],
      compare.parameterSchema as any[],
    );
    const factorDiff = diffFieldArray(
      base.factorSchema as any[],
      compare.factorSchema as any[],
    );

    return {
      baseVersion: this.toVersionSummary(base),
      compareVersion: this.toVersionSummary(compare),
      codeDiff,
      parameterDiff,
      factorDiff,
    };
  }

  private async createVersionInternal(
    strategyId: string,
    dto: CreateScriptVersionDto,
    isMaster: boolean,
  ) {
    if (!dto.code) {
      throw new BadRequestException('脚本代码不能为空');
    }

    const schemas = this.scriptParser.parse(dto.code);

    const version = this.scriptVersionRepository.create({
      strategyId,
      versionName: dto.versionName ?? generateVersionName(),
      isMaster,
      code: dto.code,
      parameterSchema: schemas.parameters,
      factorSchema: schemas.factors,
      remark: dto.remark ?? null,
      createdBy: dto.createdBy ?? null,
      updatedBy: dto.updatedBy ?? dto.createdBy ?? null,
    });
    await this.scriptVersionRepository.save(version);

    if (isMaster) {
      await this.strategyRepository.update(strategyId, {
        defaultScriptVersionId: version.scriptVersionId,
      });
      await this.scriptVersionRepository
        .createQueryBuilder()
        .update()
        .set({ isMaster: false })
        .where('strategy_id = :strategyId', { strategyId })
        .andWhere('script_version_id <> :versionId', {
          versionId: version.scriptVersionId,
        })
        .execute();
    }

    return version;
  }

  private async setMasterVersion(
    strategyId: string,
    scriptVersionId: string,
  ) {
    const version = await this.scriptVersionRepository.findOne({
      where: { scriptVersionId, strategyId },
    });
    if (!version) {
      throw new NotFoundException('脚本版本不存在');
    }

    await this.scriptVersionRepository.update(
      { strategyId },
      { isMaster: false },
    );

    await this.scriptVersionRepository.update(scriptVersionId, {
      isMaster: true,
    });

    await this.strategyRepository.update(strategyId, {
      defaultScriptVersionId: scriptVersionId,
    });
  }

  private async ensureStrategyNameUnique(name: string) {
    const existing = await this.strategyRepository.findOne({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('策略名称已存在');
    }
  }

  private async assertStrategyExists(strategyId: string) {
    const exists = await this.strategyRepository.exist({
      where: { strategyId },
    });
    if (!exists) {
      throw new NotFoundException('策略不存在');
    }
  }
}
