/**
 * 数据流管理服务
 * 
 * 负责历史数据回放和数据流控制
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, interval, BehaviorSubject, from, of, EMPTY } from 'rxjs';
import { takeWhile, map, share, concatMap } from 'rxjs/operators';
import { MarketBar } from '../interfaces/execution.interface';

/**
 * 回放状态
 */
export enum ReplayState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
}

/**
 * 数据流服务
 */
@Injectable()
export class DataFeedService {
  private readonly logger = new Logger(DataFeedService.name);

  // 回放状态
  private replayState$ = new BehaviorSubject<ReplayState>(ReplayState.IDLE);
  
  // 数据流主题
  private dataSubject$ = new Subject<MarketBar>();
  
  // 当前回放位置
  private currentIndex = 0;
  
  // 历史数据缓存
  private historicalData: MarketBar[] = [];
  
  // 回放速度 (1 = 正常速度)
  private speed = 1;

  /**
   * 订阅数据流
   * 
   * @returns 数据流Observable
   */
  subscribe(): Observable<MarketBar> {
    return this.dataSubject$.asObservable().pipe(share());
  }

  /**
   * 回放历史数据
   * 
   * @param data 历史数据
   * @param speed 回放速度 (0 = 最快速度, >0 = 定时回放)
   * @returns 数据流Observable
   */
  replay(data: MarketBar[], speed: number = 1): Observable<MarketBar> {
    this.logger.log(`Starting replay with ${data.length} bars at ${speed}x speed`);

    // 保存数据和配置
    this.historicalData = data;
    this.speed = speed;
    this.currentIndex = 0;
    this.replayState$.next(ReplayState.PLAYING);

    // 最快速度模式 (speed = 0)
    if (speed === 0) {
      this.logger.log('Using fast mode (synchronous replay)');
      return this.replayFast(data);
    }

    // 定时回放模式
    return this.replayTimed(data, speed);
  }

  /**
   * 最快速度回放 (同步推送)
   * 
   * @param data 历史数据
   * @returns 数据流Observable
   */
  private replayFast(data: MarketBar[]): Observable<MarketBar> {
    return from(data).pipe(
      concatMap((bar) => {
        // 检查状态
        if (this.replayState$.value !== ReplayState.PLAYING) {
          return EMPTY;
        }

        // 更新索引
        this.currentIndex++;

        // 发送到主数据流
        this.dataSubject$.next(bar);

        return of(bar);
      }),
      share(),
    );
  }

  /**
   * 定时回放模式
   * 
   * @param data 历史数据
   * @param speed 回放速度
   * @returns 数据流Observable
   */
  private replayTimed(data: MarketBar[], speed: number): Observable<MarketBar> {
    // 计算回放间隔 (假设1秒对应1个Bar)
    const intervalMs = 1000 / speed;

    // 创建定时器
    const replay$ = interval(intervalMs).pipe(
      takeWhile(() => {
        const state = this.replayState$.value;
        return (
          state === ReplayState.PLAYING &&
          this.currentIndex < this.historicalData.length
        );
      }),
      concatMap(() => {
        const bar = this.historicalData[this.currentIndex];
        this.currentIndex++;
        
        // 发送到主数据流
        this.dataSubject$.next(bar);
        
        return of(bar);
      }),
      share(),
    );

    // 订阅以启动回放
    replay$.subscribe({
      complete: () => {
        this.logger.log('Replay completed');
        this.replayState$.next(ReplayState.STOPPED);
      },
      error: (error) => {
        this.logger.error('Replay error:', error);
        this.replayState$.next(ReplayState.STOPPED);
      },
    });

    return replay$;
  }

  /**
   * 暂停回放
   */
  pause(): void {
    this.logger.log('Pausing replay');
    this.replayState$.next(ReplayState.PAUSED);
  }

  /**
   * 恢复回放
   */
  resume(): void {
    this.logger.log('Resuming replay');
    if (this.replayState$.value === ReplayState.PAUSED) {
      this.replayState$.next(ReplayState.PLAYING);
      
      // 重新启动回放
      this.replay(this.historicalData, this.speed);
    }
  }

  /**
   * 停止回放
   */
  stop(): void {
    this.logger.log('Stopping replay');
    this.replayState$.next(ReplayState.STOPPED);
    this.currentIndex = 0;
  }

  /**
   * 跳转到指定位置
   * 
   * @param index 数据索引
   */
  seek(index: number): void {
    if (index >= 0 && index < this.historicalData.length) {
      this.logger.log(`Seeking to index: ${index}`);
      this.currentIndex = index;
    }
  }

  /**
   * 跳转到指定时间
   * 
   * @param time 目标时间
   */
  seekToTime(time: Date): void {
    const index = this.historicalData.findIndex(
      (bar) => bar.timestamp >= time,
    );
    
    if (index !== -1) {
      this.seek(index);
    }
  }

  /**
   * 设置回放速度
   * 
   * @param speed 速度倍数
   */
  setSpeed(speed: number): void {
    this.logger.log(`Setting speed to ${speed}x`);
    this.speed = speed;
  }

  /**
   * 获取当前状态
   * 
   * @returns 回放状态
   */
  getState(): ReplayState {
    return this.replayState$.value;
  }

  /**
   * 获取进度
   * 
   * @returns 进度百分比 (0-100)
   */
  getProgress(): number {
    if (this.historicalData.length === 0) {
      return 0;
    }
    return (this.currentIndex / this.historicalData.length) * 100;
  }

  /**
   * 获取当前Bar
   * 
   * @returns 当前Bar数据
   */
  getCurrentBar(): MarketBar | null {
    if (
      this.currentIndex > 0 &&
      this.currentIndex <= this.historicalData.length
    ) {
      return this.historicalData[this.currentIndex - 1];
    }
    return null;
  }

  /**
   * 加载历史数据
   * 
   * @param symbol 品种
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @param timeframe 时间周期
   * @returns 历史数据
   */
  async loadHistoricalData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string = '1d',
  ): Promise<MarketBar[]> {
    this.logger.log(
      `Loading historical data: ${symbol} ${timeframe} ${startTime} - ${endTime}`,
    );

    // TODO: 从数据库或数据源加载历史数据
    // 这里先返回模拟数据
    const mockData: MarketBar[] = this.generateMockData(
      symbol,
      startTime,
      endTime,
      timeframe,
    );

    this.logger.log(`Loaded ${mockData.length} bars`);

    return mockData;
  }

  /**
   * 生成模拟数据 (临时用于测试)
   * 
   * @param symbol 品种
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @param timeframe 时间周期
   * @returns 模拟数据
   */
  private generateMockData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
  ): MarketBar[] {
    const data: MarketBar[] = [];
    const current = new Date(startTime);
    let price = 100;

    while (current <= endTime) {
      // 生成随机价格变动
      const change = (Math.random() - 0.5) * 2;
      price += change;

      const open = price;
      const high = price + Math.random() * 2;
      const low = price - Math.random() * 2;
      const close = price + (Math.random() - 0.5);
      const volume = Math.random() * 1000000;

      data.push({
        symbol,
        timestamp: new Date(current),
        open,
        high,
        low,
        close,
        volume,
        timeframe,
      });

      // 增加时间 (假设1天)
      current.setDate(current.getDate() + 1);
    }

    return data;
  }

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    this.stop();
    this.dataSubject$.complete();
    this.replayState$.complete();
  }
}

