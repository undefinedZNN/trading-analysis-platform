/**
 * 数据规模检查器
 * 
 * 在加载大数据集前进行预检，避免内存溢出
 */

export interface DataSizeEstimate {
  estimatedRecords: number;
  estimatedMemoryMB: number;
  recommendedBatchSize: number;
  recommendedMaxConcurrent: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
  message: string;
}

export interface DataSizeCheckOptions {
  symbol: string;
  start: string;
  end: string;
  baseTimeframe: string;
  /** 内存警告阈值（MB） */
  warnThresholdMB?: number;
  /** 内存阻断阈值（MB） */
  blockThresholdMB?: number;
}

/**
 * 数据规模检查器
 */
export class DataSizeChecker {
  private readonly warnThresholdMB: number;
  private readonly blockThresholdMB: number;
  
  constructor(options?: {
    warnThresholdMB?: number;
    blockThresholdMB?: number;
  }) {
    this.warnThresholdMB = options?.warnThresholdMB ?? 2048; // 2GB
    this.blockThresholdMB = options?.blockThresholdMB ?? 6144; // 6GB
  }
  
  /**
   * 估算数据规模
   */
  estimate(options: DataSizeCheckOptions): DataSizeEstimate {
    const { start, end, baseTimeframe } = options;
    
    // 计算时间跨度（毫秒）
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const durationMs = endMs - startMs;
    
    // 解析时间框架为毫秒
    const timeframeMs = this.parseTimeframe(baseTimeframe);
    
    // 估算记录数
    const estimatedRecords = Math.ceil(durationMs / timeframeMs);
    
    // 估算每条记录的内存占用（字节）
    // BarEvent 对象 + 各种字段 + V8 对象开销
    const bytesPerRecord = 512; // 保守估计 512 字节/记录
    
    // 估算总内存（MB）
    const estimatedMemoryMB = Math.ceil((estimatedRecords * bytesPerRecord) / (1024 * 1024));
    
    // 根据数据量推荐配置
    let recommendedBatchSize = 10000;
    let recommendedMaxConcurrent = 3;
    
    if (estimatedMemoryMB > 4096) {
      // 超过 4GB，减小批次和并发
      recommendedBatchSize = 5000;
      recommendedMaxConcurrent = 2;
    }
    if (estimatedMemoryMB > 8192) {
      // 超过 8GB，进一步减小
      recommendedBatchSize = 2000;
      recommendedMaxConcurrent = 1;
    }
    
    // 判断是否需要警告或阻断
    const shouldWarn = estimatedMemoryMB > this.warnThresholdMB;
    const shouldBlock = estimatedMemoryMB > this.blockThresholdMB;
    
    // 生成消息
    let message = `Estimated data size: ${this.formatNumber(estimatedRecords)} records, ~${estimatedMemoryMB} MB`;
    
    if (shouldBlock) {
      message = `❌ ${message}. Data set too large, please reduce time range or use a larger timeframe.`;
    } else if (shouldWarn) {
      message = `⚠️  ${message}. Large data set detected, processing may be slow. Recommended: batchSize=${recommendedBatchSize}, maxConcurrent=${recommendedMaxConcurrent}`;
    } else {
      message = `✅ ${message}`;
    }
    
    return {
      estimatedRecords,
      estimatedMemoryMB,
      recommendedBatchSize,
      recommendedMaxConcurrent,
      shouldWarn,
      shouldBlock,
      message,
    };
  }
  
  /**
   * 解析时间框架为毫秒
   */
  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid timeframe format: ${timeframe}`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    const unitMs: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
    };
    
    return value * (unitMs[unit] || 60000);
  }
  
  /**
   * 格式化数字（添加千位分隔符）
   */
  private formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

/**
 * 创建数据规模检查器
 */
export function createDataSizeChecker(options?: {
  warnThresholdMB?: number;
  blockThresholdMB?: number;
}): DataSizeChecker {
  return new DataSizeChecker(options);
}

