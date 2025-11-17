/**
 * OHLCV 数据生成器
 * 用于生成连贯的模拟市场数据
 * 
 * 特性:
 * - 生成连贯的OHLCV数据（后一条的开盘价 = 前一条的收盘价）
 * - 支持涨跌幅上限控制（防止价格无限增长或跌至负数）
 * - 支持不同趋势（上涨/下跌/震荡）
 * 
 * @example
 * // 初始价格100，波动率2%，最大涨跌幅100%（即价格范围0-200）
 * const generator = new OHLCVGenerator(100, 0.02, 1.0);
 * const data = generator.generateTrendingData(100, 'up');
 */

export interface OHLCVRecord {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class OHLCVGenerator {
  private initialPrice: number;
  private currentPrice: number;
  private volatility: number;
  private lastRecord: OHLCVRecord | null;
  private maxChangePercent: number; // 最大涨跌幅（如 2.0 表示 200%）
  private minPrice: number; // 最低价格（初始价格 * (1 - maxChangePercent)，但不低于0）
  private maxPrice: number; // 最高价格（初始价格 * (1 + maxChangePercent)）

  constructor(initialPrice = 100, volatility = 0.02, maxChangePercent = 2.0) {
    this.initialPrice = initialPrice;
    this.currentPrice = initialPrice;
    this.volatility = volatility;
    this.lastRecord = null;
    this.maxChangePercent = maxChangePercent;
    
    // 计算价格上下限
    this.minPrice = Math.max(0, initialPrice * (1 - maxChangePercent));
    this.maxPrice = initialPrice * (1 + maxChangePercent);
  }

  /**
   * 限制价格在允许的范围内
   */
  private clampPrice(price: number): number {
    return Math.max(this.minPrice, Math.min(this.maxPrice, price));
  }

  /**
   * 生成一条OHLCV记录
   */
  generateRecord(): OHLCVRecord {
    let open: number;

    // 如果是第一条记录，使用初始价格作为开盘价
    // 否则使用上一条记录的收盘价作为开盘价
    if (this.lastRecord === null) {
      open = this.currentPrice;
    } else {
      open = this.lastRecord.close;
    }

    // 基于开盘价计算当日价格变动
    const change = (Math.random() - 0.5) * 2 * this.volatility;
    let close = open * (1 + change);
    
    // 限制收盘价在允许的范围内
    close = this.clampPrice(close);

    // 生成最高价和最低价
    const range = Math.abs(close - open) + open * this.volatility * Math.random();
    let high = Math.max(open, close) + range * 0.3;
    let low = Math.min(open, close) - range * 0.3;
    
    // 限制高低价在允许的范围内
    high = this.clampPrice(high);
    low = this.clampPrice(low);
    
    // 确保 high >= open/close 且 low <= open/close
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);

    // 生成成交量（与价格波动相关）
    const volume = Math.floor(Math.abs(change) * 1000000 + Math.random() * 500000);

    // 更新当前价格
    this.currentPrice = close;

    const record: OHLCVRecord = {
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: volume,
    };

    // 保存最后一条记录用于下次生成
    this.lastRecord = record;

    return record;
  }

  /**
   * 生成多条OHLCV记录
   */
  generateData(count = 100): OHLCVRecord[] {
    const data: OHLCVRecord[] = [];
    for (let i = 0; i < count; i++) {
      data.push(this.generateRecord());
    }
    return data;
  }

  /**
   * 生成带趋势的数据
   */
  generateTrendingData(count = 100, trendDirection: 'up' | 'down' | 'sideways' = 'up'): OHLCVRecord[] {
    const data: OHLCVRecord[] = [];
    let trend = 0;

    if (trendDirection === 'up') {
      trend = 0.001; // 每条记录上涨0.1%
    } else if (trendDirection === 'down') {
      trend = -0.001; // 每条记录下跌0.1%
    }

    for (let i = 0; i < count; i++) {
      const record = this.generateRecord();
      
      // 添加趋势
      if (trend !== 0) {
        // 应用趋势并限制在允许的范围内
        record.open = this.clampPrice(record.open * (1 + trend));
        record.high = this.clampPrice(record.high * (1 + trend));
        record.low = this.clampPrice(record.low * (1 + trend));
        record.close = this.clampPrice(record.close * (1 + trend));
        
        // 确保 high >= open/close 且 low <= open/close
        record.high = Math.max(record.high, record.open, record.close);
        record.low = Math.min(record.low, record.open, record.close);
        
        this.currentPrice = record.close;
      }

      data.push(record);
    }
    return data;
  }

  /**
   * 重置生成器状态
   */
  reset(): void {
    this.currentPrice = this.initialPrice;
    this.lastRecord = null;
  }

  /**
   * 获取价格范围信息
   */
  getPriceRange(): { minPrice: number; maxPrice: number; initialPrice: number; maxChangePercent: number } {
    return {
      minPrice: this.minPrice,
      maxPrice: this.maxPrice,
      initialPrice: this.initialPrice,
      maxChangePercent: this.maxChangePercent,
    };
  }

  /**
   * 获取当前状态（用于调试）
   */
  getState(): { 
    currentPrice: number; 
    lastRecord: OHLCVRecord | null;
    priceRange: { minPrice: number; maxPrice: number; initialPrice: number };
  } {
    return {
      currentPrice: this.currentPrice,
      lastRecord: this.lastRecord,
      priceRange: {
        minPrice: this.minPrice,
        maxPrice: this.maxPrice,
        initialPrice: this.initialPrice,
      },
    };
  }
}

