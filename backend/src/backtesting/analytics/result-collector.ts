/**
 * 结果收集器
 * 
 * 从各个模块收集回测结果并生成完整的会话结果
 * 
 * @module analytics/result-collector
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import type {
  ResultCollector,
  SessionResults,
  SessionConfigSummary,
  PerformanceMetrics,
} from './interfaces';
import { ResultExportError } from './interfaces';
import type { TradeRecord, TradeStats, LedgerService } from '../ledger/interfaces';
import type { PerformanceCalculatorImpl as PerformanceCalculator } from './performance-calculator';
import type { EquityCurveGenerator } from './equity-curve-generator';

/**
 * 结果收集器配置
 */
export interface ResultCollectorConfig {
  /** 结果输出目录 */
  outputDir: string;
  /** 性能计算器 */
  performanceCalculator: PerformanceCalculator;
  /** 权益曲线生成器 */
  equityCurveGenerator: EquityCurveGenerator;
  /** 是否自动创建输出目录 */
  autoCreateDir?: boolean;
}

/**
 * 模块数据源
 */
export interface DataSources {
  /** Ledger服务 */
  ledger?: LedgerService;
  /** 事件存储 */
  eventStore?: {
    getLogs(sessionId: string): Promise<any[]>;
    getEventCount(sessionId: string): Promise<number>;
  };
  /** 特征注册表 */
  featureRegistry?: {
    generateCatalog(): any;
  };
}

/**
 * 收集选项
 */
export interface CollectionOptions {
  /** 是否包含日志 */
  includeLogs?: boolean;
  /** 是否包含特征目录 */
  includeFeatureCatalog?: boolean;
  /** 是否保存到文件 */
  saveToFile?: boolean;
  /** 自定义输出路径 */
  customOutputPath?: string;
}

/**
 * 结果收集器实现
 */
export class ResultCollectorImpl implements ResultCollector {
  private config: Required<ResultCollectorConfig>;

  constructor(config: ResultCollectorConfig) {
    this.config = {
      autoCreateDir: true,
      ...config,
    };
  }

  /**
   * 收集会话结果
   */
  async collectResults(sessionId: string): Promise<SessionResults> {
    try {
      // 确保输出目录存在
      if (this.config.autoCreateDir) {
        await this.ensureOutputDir();
      }

      // 收集各模块数据
      const startTime = new Date().toISOString();

      // 这里需要从外部传入数据源，暂时返回基础结构
      // 实际使用时，需要通过依赖注入获取各模块的引用

      const results: SessionResults = {
        sessionId,
        config: {
          sessionId,
          strategyId: '',
          strategyName: '',
          symbols: [],
          timeframe: '',
          startTime: '',
          endTime: '',
          initialCapital: '0',
        },
        metrics: this.createEmptyMetrics(),
        equityCurve: {
          timestamps: [],
          equity: [],
          drawdown: [],
        },
        files: {
          ledger: '',
          featureCatalog: '',
          logs: '',
          fullResults: '',
        },
        createdAt: startTime,
        completedAt: new Date().toISOString(),
        status: 'completed',
      };

      return results;
    } catch (error) {
      throw new ResultExportError(
        `Failed to collect results for session ${sessionId}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 收集完整结果（带数据源）
   */
  async collectResultsWithSources(
    sessionId: string,
    configSummary: SessionConfigSummary,
    dataSources: DataSources,
    options: CollectionOptions = {}
  ): Promise<SessionResults> {
    const errors: string[] = [];
    let status: 'completed' | 'partial' | 'failed' = 'completed';

    try {
      // 1. 收集交易数据和统计
      let trades: TradeRecord[] = [];
      let tradeStats: TradeStats | null = null;

      if (dataSources.ledger) {
        try {
          trades = await dataSources.ledger.getTrades();
          tradeStats = await dataSources.ledger.getStats();
        } catch (error) {
          errors.push(`Failed to collect ledger data: ${error}`);
          status = 'partial';
        }
      } else {
        errors.push('Ledger service not provided');
        status = 'partial';
      }

      // 2. 生成权益曲线
      let equityCurve;
      try {
        equityCurve = this.config.equityCurveGenerator.generate(trades);
      } catch (error) {
        errors.push(`Failed to generate equity curve: ${error}`);
        equityCurve = {
          timestamps: [],
          equity: [],
          drawdown: [],
        };
        status = 'partial';
      }

      // 3. 计算性能指标
      let metrics: PerformanceMetrics;
      if (tradeStats) {
        try {
          metrics = this.config.performanceCalculator.calculate(
            equityCurve,
            tradeStats
          );
        } catch (error) {
          errors.push(`Failed to calculate metrics: ${error}`);
          metrics = this.createEmptyMetrics();
          status = 'partial';
        }
      } else {
        metrics = this.createEmptyMetrics();
      }

      // 4. 收集日志（可选）
      let logsPath = '';
      if (options.includeLogs && dataSources.eventStore) {
        try {
          const logs = await dataSources.eventStore.getLogs(sessionId);
          logsPath = await this.saveLogs(sessionId, logs);
        } catch (error) {
          errors.push(`Failed to collect logs: ${error}`);
        }
      }

      // 5. 收集特征目录（可选）
      let catalogPath = '';
      if (options.includeFeatureCatalog && dataSources.featureRegistry) {
        try {
          const catalog = dataSources.featureRegistry.generateCatalog();
          catalogPath = await this.saveFeatureCatalog(sessionId, catalog);
        } catch (error) {
          errors.push(`Failed to collect feature catalog: ${error}`);
        }
      }

      // 6. 保存账簿数据
      let ledgerPath = '';
      if (dataSources.ledger && options.saveToFile !== false) {
        try {
          ledgerPath = await this.saveLedgerData(sessionId, trades);
        } catch (error) {
          errors.push(`Failed to save ledger data: ${error}`);
        }
      }

      // 7. 组装结果
      const results: SessionResults = {
        sessionId,
        config: configSummary,
        metrics,
        equityCurve,
        files: {
          ledger: ledgerPath,
          featureCatalog: catalogPath,
          logs: logsPath,
          fullResults: '',
        },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: errors.length > 0 ? status : 'completed',
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };

      // 8. 保存完整结果（可选）
      if (options.saveToFile !== false) {
        try {
          const fullResultsPath = await this.saveFullResults(sessionId, results);
          results.files.fullResults = fullResultsPath;
        } catch (error) {
          errors.push(`Failed to save full results: ${error}`);
        }
      }

      return results;
    } catch (error) {
      throw new ResultExportError(
        `Failed to collect results for session ${sessionId}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 导出结果到文件
   */
  async exportResults(
    sessionId: string,
    format: 'json' | 'parquet' | 'csv',
    outputPath: string
  ): Promise<void> {
    try {
      // 确保输出目录存在
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });

      // 根据格式导出
      switch (format) {
        case 'json':
          await this.exportToJSON(sessionId, outputPath);
          break;
        case 'parquet':
          throw new Error('Parquet export not yet implemented');
        case 'csv':
          throw new Error('CSV export not yet implemented');
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      throw new ResultExportError(
        `Failed to export results to ${format}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 导出为JSON
   */
  private async exportToJSON(sessionId: string, outputPath: string): Promise<void> {
    // 收集结果
    const results = await this.collectResults(sessionId);

    // 写入文件
    await fs.writeFile(
      outputPath,
      JSON.stringify(results, null, 2),
      'utf-8'
    );
  }

  /**
   * 保存账簿数据
   */
  private async saveLedgerData(
    sessionId: string,
    trades: TradeRecord[]
  ): Promise<string> {
    const filename = `ledger-${sessionId}-${Date.now()}.json`;
    const filepath = path.join(this.config.outputDir, sessionId, filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(trades, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * 保存日志
   */
  private async saveLogs(sessionId: string, logs: any[]): Promise<string> {
    const filename = `logs-${sessionId}-${Date.now()}.json`;
    const filepath = path.join(this.config.outputDir, sessionId, filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(logs, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * 保存特征目录
   */
  private async saveFeatureCatalog(
    sessionId: string,
    catalog: any
  ): Promise<string> {
    const filename = `feature-catalog-${sessionId}.json`;
    const filepath = path.join(this.config.outputDir, sessionId, filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(catalog, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * 保存完整结果
   */
  private async saveFullResults(
    sessionId: string,
    results: SessionResults
  ): Promise<string> {
    const filename = `results-${sessionId}.json`;
    const filepath = path.join(this.config.outputDir, sessionId, filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(results, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * 确保输出目录存在
   */
  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.access(this.config.outputDir);
    } catch {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * 创建空的性能指标
   */
  private createEmptyMetrics(): PerformanceMetrics {
    return {
      trading: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: '0',
        avgPnl: '0',
        avgWin: '0',
        avgLoss: '0',
        profitFactor: 0,
        maxWin: '0',
        maxLoss: '0',
        totalFees: '0',
      },
      risk: {
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
        downsideDeviation: 0,
        var95: 0,
        cvar95: 0,
        maxDrawdown: 0,
        volatility: 0,
      },
      returns: {
        dailyReturns: [],
        cumulativeReturn: 0,
        annualizedReturn: 0,
        meanDailyReturn: 0,
        stdDevReturns: 0,
        positiveDays: 0,
        negativeDays: 0,
      },
      drawdown: {
        maxDrawdown: 0,
        maxDrawdownStart: '',
        maxDrawdownEnd: '',
        maxDrawdownDuration: 0,
        currentDrawdown: 0,
      },
    };
  }

  /**
   * 获取会话输出目录
   */
  getSessionOutputDir(sessionId: string): string {
    return path.join(this.config.outputDir, sessionId);
  }

  /**
   * 清理会话结果文件
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionOutputDir(sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      throw new ResultExportError(
        `Failed to cleanup session ${sessionId}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * 创建结果收集器
 */
export function createResultCollector(
  config: ResultCollectorConfig
): ResultCollector {
  return new ResultCollectorImpl(config);
}

