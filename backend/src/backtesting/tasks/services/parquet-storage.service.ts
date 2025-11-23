import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 交易数据结构
 */
export interface TradeData {
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  size: number;
  direction: 'long' | 'short';
  pnl: number;
  commission: number;
  // 因子数据
  entry_factors?: Record<string, any>;
  holding_factors?: Record<string, any>[];
  exit_factors?: Record<string, any>;
}

/**
 * 权益曲线数据点
 */
export interface EquityPoint {
  datetime: string;
  value: number;
  cash: number;
}

/**
 * 过滤条件
 */
export interface FilterConditions {
  factors?: Record<string, any>;
  timeRange?: {
    start?: string;
    end?: string;
  };
  tradeType?: {
    buy?: boolean;
    sell?: boolean;
  };
}

/**
 * Parquet 存储服务
 * 负责将回测数据保存到 Parquet 文件并提供查询功能
 */
@Injectable()
export class ParquetStorageService {
  private readonly logger = new Logger(ParquetStorageService.name);
  private readonly storageBasePath: string;

  constructor(private readonly configService: ConfigService) {
    // 从配置中读取存储路径，默认为 backend/storage/backtest-results
    this.storageBasePath = this.configService.get<string>(
      'BACKTEST_STORAGE_PATH',
      path.join(process.cwd(), 'storage', 'backtest-results'),
    );
  }

  /**
   * 保存交易数据到 Parquet 文件
   * @param taskId 任务ID
   * @param trades 交易数据
   * @returns Parquet 文件相对路径
   */
  async saveTradesWithFactors(
    taskId: string,
    trades: TradeData[],
  ): Promise<string> {
    this.logger.log(`Saving trades for task ${taskId}, count: ${trades.length}`);

    try {
      // 创建任务专属目录
      const taskDir = await this.ensureTaskDirectory(taskId);

      // 生成文件路径
      const fileName = `trades_${Date.now()}.parquet`;
      const filePath = path.join(taskDir, fileName);
      const relativePath = this.getRelativePath(filePath);

      // 保存数据到 JSON 文件（临时）
      const jsonPath = filePath.replace('.parquet', '.json');
      await fs.writeFile(jsonPath, JSON.stringify(trades, null, 2));

      // 使用 Python 脚本将 JSON 转换为 Parquet
      await this.convertJsonToParquet(jsonPath, filePath);

      // 删除临时 JSON 文件
      await fs.unlink(jsonPath);

      this.logger.log(`Trades saved to: ${relativePath}`);
      return relativePath;
    } catch (error) {
      this.logger.error(`Failed to save trades for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * 保存权益曲线到 Parquet 文件
   * @param taskId 任务ID
   * @param equityCurve 权益曲线数据
   * @returns Parquet 文件相对路径
   */
  async saveEquityCurve(
    taskId: string,
    equityCurve: EquityPoint[],
  ): Promise<string> {
    this.logger.log(
      `Saving equity curve for task ${taskId}, points: ${equityCurve.length}`,
    );

    try {
      // 创建任务专属目录
      const taskDir = await this.ensureTaskDirectory(taskId);

      // 生成文件路径
      const fileName = `equity_${Date.now()}.parquet`;
      const filePath = path.join(taskDir, fileName);
      const relativePath = this.getRelativePath(filePath);

      // 保存数据到 JSON 文件（临时）
      const jsonPath = filePath.replace('.parquet', '.json');
      await fs.writeFile(jsonPath, JSON.stringify(equityCurve, null, 2));

      // 使用 Python 脚本将 JSON 转换为 Parquet
      await this.convertJsonToParquet(jsonPath, filePath);

      // 删除临时 JSON 文件
      await fs.unlink(jsonPath);

      this.logger.log(`Equity curve saved to: ${relativePath}`);
      return relativePath;
    } catch (error) {
      this.logger.error(`Failed to save equity curve for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * 读取交易数据
   * @param filePath 文件路径（相对路径或绝对路径）
   * @param filterConditions 过滤条件（可选）
   * @returns 交易数据数组
   */
  async loadTradesWithFactors(
    filePath: string,
    filterConditions?: FilterConditions,
  ): Promise<TradeData[]> {
    this.logger.log(`Loading trades from: ${filePath}`);

    try {
      const absolutePath = this.getAbsolutePath(filePath);

      // 检查文件是否存在
      await this.checkFileExists(absolutePath);

      // 使用 Python 脚本读取 Parquet 文件
      const trades = await this.readParquetFile<TradeData>(absolutePath);

      // 应用过滤条件
      if (filterConditions) {
        return this.applyFilters(trades, filterConditions);
      }

      return trades;
    } catch (error) {
      this.logger.error(`Failed to load trades from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 读取权益曲线数据
   * @param filePath 文件路径（相对路径或绝对路径）
   * @returns 权益曲线数据数组
   */
  async loadEquityCurve(filePath: string): Promise<EquityPoint[]> {
    this.logger.log(`Loading equity curve from: ${filePath}`);

    try {
      const absolutePath = this.getAbsolutePath(filePath);

      // 检查文件是否存在
      await this.checkFileExists(absolutePath);

      // 使用 Python 脚本读取 Parquet 文件
      return await this.readParquetFile<EquityPoint>(absolutePath);
    } catch (error) {
      this.logger.error(`Failed to load equity curve from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 删除任务的所有文件
   * @param taskId 任务ID
   */
  async deleteTaskFiles(taskId: string): Promise<void> {
    this.logger.log(`Deleting files for task ${taskId}`);

    try {
      const taskDir = path.join(this.storageBasePath, taskId);

      // 检查目录是否存在
      try {
        await fs.access(taskDir);
      } catch {
        this.logger.warn(`Task directory not found: ${taskDir}`);
        return;
      }

      // 删除目录及其内容
      await fs.rm(taskDir, { recursive: true, force: true });
      this.logger.log(`Task files deleted: ${taskDir}`);
    } catch (error) {
      this.logger.error(`Failed to delete task files for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * 删除单个文件
   * @param filePath 文件路径
   */
  async deleteFile(filePath: string): Promise<void> {
    this.logger.log(`Deleting file: ${filePath}`);

    try {
      const absolutePath = this.getAbsolutePath(filePath);
      await fs.unlink(absolutePath);
      this.logger.log(`File deleted: ${absolutePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 获取文件大小
   * @param filePath 文件路径
   * @returns 文件大小（字节）
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      const stats = await fs.stat(absolutePath);
      return stats.size;
    } catch (error) {
      this.logger.error(`Failed to get file size for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 确保任务目录存在
   * @param taskId 任务ID
   * @returns 任务目录的绝对路径
   */
  private async ensureTaskDirectory(taskId: string): Promise<string> {
    const taskDir = path.join(this.storageBasePath, taskId);
    await fs.mkdir(taskDir, { recursive: true });
    return taskDir;
  }

  /**
   * 获取相对路径（相对于 storageBasePath）
   * @param absolutePath 绝对路径
   * @returns 相对路径
   */
  private getRelativePath(absolutePath: string): string {
    return path.relative(this.storageBasePath, absolutePath);
  }

  /**
   * 获取绝对路径
   * @param filePath 文件路径（可能是相对路径或绝对路径）
   * @returns 绝对路径
   */
  private getAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.storageBasePath, filePath);
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   */
  private async checkFileExists(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
  }

  /**
   * 使用 Python 脚本将 JSON 转换为 Parquet
   * @param jsonPath JSON 文件路径
   * @param parquetPath Parquet 文件路径
   */
  private async convertJsonToParquet(
    jsonPath: string,
    parquetPath: string,
  ): Promise<void> {
    // Python 脚本内容
    const pythonScript = `
import json
import pandas as pd

# 读取 JSON 文件
with open('${jsonPath}', 'r') as f:
    data = json.load(f)

# 转换为 DataFrame
df = pd.DataFrame(data)

# 保存为 Parquet
df.to_parquet('${parquetPath}', engine='pyarrow', compression='snappy')

print('Conversion completed')
`;

    // 写入临时 Python 脚本
    const scriptPath = jsonPath.replace('.json', '_convert.py');
    await fs.writeFile(scriptPath, pythonScript);

    try {
      // 执行 Python 脚本
      const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`);
      
      if (stderr) {
        this.logger.warn(`Python stderr: ${stderr}`);
      }
      
      this.logger.debug(`Python stdout: ${stdout}`);
    } finally {
      // 删除临时脚本
      await fs.unlink(scriptPath).catch(() => {});
    }
  }

  /**
   * 使用 Python 脚本读取 Parquet 文件
   * @param parquetPath Parquet 文件路径
   * @returns 数据数组
   */
  private async readParquetFile<T>(parquetPath: string): Promise<T[]> {
    // 临时 JSON 文件路径
    const jsonPath = parquetPath.replace('.parquet', '_temp.json');

    // Python 脚本内容
    const pythonScript = `
import pandas as pd
import json

# 读取 Parquet 文件
df = pd.read_parquet('${parquetPath}', engine='pyarrow')

# 转换为 JSON
json_data = df.to_json(orient='records', date_format='iso')

# 写入 JSON 文件
with open('${jsonPath}', 'w') as f:
    f.write(json_data)

print('Read completed')
`;

    // 写入临时 Python 脚本
    const scriptPath = parquetPath.replace('.parquet', '_read.py');
    await fs.writeFile(scriptPath, pythonScript);

    try {
      // 执行 Python 脚本
      const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`);
      
      if (stderr) {
        this.logger.warn(`Python stderr: ${stderr}`);
      }
      
      this.logger.debug(`Python stdout: ${stdout}`);

      // 读取生成的 JSON 文件
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(jsonContent);
    } finally {
      // 删除临时文件
      await fs.unlink(scriptPath).catch(() => {});
      await fs.unlink(jsonPath).catch(() => {});
    }
  }

  /**
   * 应用过滤条件
   * @param trades 交易数据
   * @param filters 过滤条件
   * @returns 过滤后的交易数据
   */
  private applyFilters(
    trades: TradeData[],
    filters: FilterConditions,
  ): TradeData[] {
    let filtered = [...trades];

    // 时间范围过滤
    if (filters.timeRange) {
      const { start, end } = filters.timeRange;
      filtered = filtered.filter((trade) => {
        if (start && trade.entry_time < start) return false;
        if (end && trade.entry_time > end) return false;
        return true;
      });
    }

    // 交易类型过滤
    if (filters.tradeType) {
      const { buy, sell } = filters.tradeType;
      if (buy === false) {
        filtered = filtered.filter((trade) => trade.direction !== 'long');
      }
      if (sell === false) {
        filtered = filtered.filter((trade) => trade.direction !== 'short');
      }
    }

    // 因子过滤
    if (filters.factors) {
      filtered = filtered.filter((trade) => {
        return this.matchFactors(trade, filters.factors!);
      });
    }

    return filtered;
  }

  /**
   * 检查交易是否匹配因子条件
   * @param trade 交易数据
   * @param factorFilters 因子过滤条件
   * @returns 是否匹配
   */
  private matchFactors(
    trade: TradeData,
    factorFilters: Record<string, any>,
  ): boolean {
    // 简单实现：检查 entry_factors 是否匹配
    if (!trade.entry_factors) return false;

    for (const [key, value] of Object.entries(factorFilters)) {
      const tradeValue = trade.entry_factors[key];
      
      // 如果是范围条件 {min, max}
      if (typeof value === 'object' && (value.min !== undefined || value.max !== undefined)) {
        if (value.min !== undefined && tradeValue < value.min) return false;
        if (value.max !== undefined && tradeValue > value.max) return false;
      } else {
        // 精确匹配
        if (tradeValue !== value) return false;
      }
    }

    return true;
  }
}

