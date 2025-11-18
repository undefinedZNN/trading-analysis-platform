import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskConfigDto, ScriptMetadataDto } from '@trading-platform/backtesting-contracts';
import { nanoid } from 'nanoid';
import { HistoricalBar } from './interfaces';
import { ExecutionEngineImpl } from '../backtesting/execution/engine';
import {
  BarEvent,
  ExecutionEngineConfig,
  ExecutionStats,
  ExecutionReportPayload,
  OrderIntentPayload,
} from '../backtesting/execution/interfaces';
import {
  MACrossStrategy,
  parameters as maParameters,
} from '../backtesting/strategies/ma-cross.strategy';
import {
  BollingerBandsStrategy,
  parameters as bollParameters,
} from '../backtesting/strategies/bollinger-bands.strategy';
import {
  RSIMeanReversionStrategy,
  parameters as rsiParameters,
} from '../backtesting/strategies/rsi-mean-reversion.strategy';
import {
  ThreeLineMomentumStrategy,
  parameters as tlmParameters,
} from '../backtesting/strategies/three-line-momentum.strategy';
import { LedgerServiceImpl } from '../backtesting/ledger/service';
import { TradeRecord, TradeStats } from '../backtesting/ledger/interfaces';
import { RiskEngineImpl } from '../backtesting/risk/engine';
import { RiskDecisionResult } from '../backtesting/risk/interfaces';
import {
  DynamicStrategyExecutor,
  LoadedDynamicStrategy,
} from '../backtesting/strategies/dynamic-strategy.executor';

type StrategyType =
  | 'ma-cross'
  | 'bollinger-bands'
  | 'rsi-mean-reversion'
  | 'three-line-momentum'
  | 'dynamic';

interface StrategyLifecycle {
  onInit?: () => void | Promise<void>;
  onBar: (bar: any) => void | Promise<void>;
}

interface StrategyIntentInput {
  type: 'market' | 'limit';
  side: 'buy' | 'sell';
  quantity: string;
  tif?: 'GTC' | 'IOC' | 'FOK';
  reason?: string;
}

interface StrategySession {
  taskId: string;
  sessionId: string;
  strategyType: StrategyType;
  params: Record<string, any>;
  config: TaskConfigDto;
  engine: ExecutionEngineImpl;
  riskEngine: any;
  ledger: LedgerServiceImpl;
  strategy: StrategyLifecycle;
  context: StrategyContextImpl;
  priceHistory: number[];
  lastPrice: number;
  scriptState: unknown;
  currentBar: HistoricalBar | null;
  dynamicStrategy?: LoadedDynamicStrategy | null;
  account: {
    cash: number;
    positionQty: number;
    avgEntryPrice: number;
    realizedPnl: number;
  };
}

export interface StrategyResultMetrics {
  execution: ExecutionStats;
  trades: TradeStats;
  account: {
    cash: number;
    positionQty: number;
    avgEntryPrice: number;
    realizedPnl: number;
    equity: number;
  };
}

class StrategyContextImpl {
  private session?: StrategySession;

  constructor(private readonly runner: StrategyRunner, private readonly taskId: string) { }

  bindSession(session: StrategySession) {
    this.session = session;
  }

  log(level: string, message: string, meta?: Record<string, unknown>) {
    if (level.toLowerCase() === 'debug') {
      return;
    }
    this.runner.logWithLevel(`[Strategy ${this.taskId}] ${message}`, level, meta);
  }

  metrics(name: string, payload: Record<string, unknown>) {
    if (!this.runner.shouldLogMetrics()) {
      return;
    }
    this.runner.logger.debug(`[Strategy ${this.taskId}] metric ${name}`, payload);
  }

  getEquity(): string {
    if (!this.session) {
      return '0';
    }
    return this.runner.getEquity(this.session).toFixed(2);
  }

  getParameters<T = Record<string, any>>(): T {
    return (this.session?.params as T) ?? ({} as T);
  }

  getState<T = any>(): T | null {
    return (this.session?.scriptState as T) ?? null;
  }

  setState(state: unknown): void {
    if (this.session) {
      this.session.scriptState = state;
    }
  }

  setCurrentBar(bar: HistoricalBar | null) {
    if (this.session) {
      this.session.currentBar = bar;
    }
  }

  getCurrentBar(): HistoricalBar | null {
    return this.session?.currentBar ?? null;
  }

  getTaskConfig(): TaskConfigDto | undefined {
    return this.session?.config;
  }

  publishIntent(intent: StrategyIntentInput): void {
    if (!this.session) {
      return;
    }
    void this.runner.dispatchIntent(this.session, intent);
  }

  submitOrder(intent: StrategyIntentInput): void {
    this.publishIntent(intent);
  }

  recordMetrics(
    nameOrPayload: string | Record<string, unknown>,
    payload?: Record<string, unknown>,
  ) {
    if (typeof nameOrPayload === 'string') {
      this.metrics(nameOrPayload, payload ?? {});
      return;
    }
    this.metrics('custom', nameOrPayload);
  }
}

@Injectable()
export class StrategyRunner {
  readonly logger = new Logger(StrategyRunner.name);
  private readonly sessions = new Map<string, StrategySession>();
  private readonly metricsLoggingEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamicStrategyExecutor: DynamicStrategyExecutor,
  ) {
    this.metricsLoggingEnabled = this.configService.get<boolean>('worker.logging.metrics', false);
  }

  async runChunk(taskId: string, config: TaskConfigDto, bars: HistoricalBar[]): Promise<void> {
    const session = await this.ensureSession(taskId, config);

    for (const bar of bars) {
      session.lastPrice = bar.close;
      session.priceHistory.push(bar.close);
      if (session.priceHistory.length > 5000) {
        session.priceHistory.shift();
      }

      session.context.setCurrentBar(bar);
      const enrichedBar = this.enrichBarWithFeatures(session, bar);
      await Promise.resolve(session.strategy.onBar(enrichedBar));
      await session.engine.processBars([this.toBarEvent(config, bar)]);
    }
  }

  shouldLogMetrics(): boolean {
    return this.metricsLoggingEnabled;
  }

  complete(taskId: string): StrategyResultMetrics | undefined {
    const session = this.sessions.get(taskId);
    if (!session) {
      return undefined;
    }

    this.sessions.delete(taskId);
    return {
      execution: session.engine.getStats(),
      trades: session.ledger.getStats(),
      account: {
        cash: session.account.cash,
        positionQty: session.account.positionQty,
        avgEntryPrice: session.account.avgEntryPrice,
        realizedPnl: session.account.realizedPnl,
        equity: this.getEquity(session),
      },
    };
  }

  logWithLevel(message: string, level?: string, meta?: Record<string, unknown>) {
    const normalized = (level || 'info').toLowerCase();
    if (normalized === 'error') {
      this.logger.error(message, meta as any);
    } else if (normalized === 'warn' || normalized === 'warning') {
      this.logger.warn(message, meta as any);
    } else if (normalized === 'debug') {
      this.logger.debug(message, meta as any);
    } else {
      this.logger.log(message, meta as any);
    }
  }

  private async ensureSession(taskId: string, config: TaskConfigDto): Promise<StrategySession> {
    const existing = this.sessions.get(taskId);
    if (existing) {
      return existing;
    }

    const scriptPayload: ScriptMetadataDto | undefined = (config as any).script;
    const hasDynamicScript =
      typeof scriptPayload?.compiledCode === 'string' &&
      scriptPayload.compiledCode.trim().length > 0;

    const strategyType: StrategyType = hasDynamicScript
      ? 'dynamic'
      : this.resolveStrategyType(config);
    const params = hasDynamicScript
      ? { ...(config.parameters || {}) }
      : this.resolveStrategyParams(strategyType, config.parameters || {});

    this.logger.log(
      `Initializing strategy for task ${taskId}: type=${strategyType}, strategyId=${config.strategyId}`,
      params,
    );
    const context = new StrategyContextImpl(this, taskId);

    const engineConfig: ExecutionEngineConfig = {
      sessionId: `${taskId}-${Date.now()}`,
      strategyId: config.strategyId,
      marketFillPolicy: 'close',
      trackPositions: true,
      logger: (_level, message, meta) => {
        return;
        this.logger.debug(`[${taskId}] ${message}`, meta);
      },
    };

    const engine = new ExecutionEngineImpl(engineConfig);
    const riskEngine = new RiskEngineImpl({
      sessionId: engineConfig.sessionId,
      strategyId: config.strategyId,
      simulationMode: true,
      logger: (_level, message, meta) => {
        return;
        this.logger.debug(`[Risk ${taskId}] ${message}`, meta);
      },
    });
    const ledger = new LedgerServiceImpl({
      sessionId: engineConfig.sessionId,
      strategyId: config.strategyId,
      bufferSize: 500,
      logger: (_level, message, meta) => {
        return;
        this.logger.debug(`[Ledger ${taskId}] ${message}`, meta);
      },
    });

    const session: StrategySession = {
      taskId,
      sessionId: engineConfig.sessionId,
      strategyType,
      params,
      config,
      engine,
      riskEngine,
      ledger,
      strategy: {} as StrategyLifecycle,
      context,
      priceHistory: [],
      lastPrice: Number(config.parameters?.initialPrice ?? 100),
      scriptState: null,
      currentBar: null,
      account: {
        cash: Number(config.parameters?.initialCapital ?? 10000),
        positionQty: 0,
        avgEntryPrice: 0,
        realizedPnl: 0,
      },
    };

    const strategyInstance = hasDynamicScript && scriptPayload
      ? this.createDynamicStrategy(scriptPayload, context, session)
      : this.createStrategyInstance(strategyType, params, context);

    session.strategy = strategyInstance;
    context.bindSession(session);
    await Promise.resolve(session.strategy.onInit?.());

    engine.setEventCallbacks({
      onExecutionReport: (report) =>
        this.handleExecutionReport(session, report).catch((error) =>
          this.logger.error(`Failed to handle execution report`, {
            error: (error as Error)?.message || error,
            report,
          }),
        ),
      onPortfolioUpdate: (update) => {
        try {
          riskEngine.updatePortfolio(update as any);
        } catch (error) {
          this.logWithLevel('Risk engine failed to process portfolio update', 'warn', {
            error: (error as Error)?.message,
          });
        }
      },
    });

    this.sessions.set(taskId, session);
    return session;
  }

  private resolveStrategyType(config: TaskConfigDto): StrategyType {
    const id = String(config.parameters?.strategyType ?? config.strategyId ?? '').toLowerCase();
    if (id.includes('three-line') || (id.includes('three') && id.includes('momentum'))) {
      return 'three-line-momentum';
    }
    if (id.includes('bollinger')) {
      return 'bollinger-bands';
    }
    if (id.includes('rsi')) {
      return 'rsi-mean-reversion';
    }
    return 'ma-cross';
  }

  private resolveStrategyParams(type: StrategyType, overrides: Record<string, any>) {
    if (type === 'dynamic') {
      return { ...overrides };
    }
    const defs =
      type === 'bollinger-bands'
        ? bollParameters
        : type === 'rsi-mean-reversion'
          ? rsiParameters
          : type === 'three-line-momentum'
            ? tlmParameters
            : maParameters;

    const params: Record<string, any> = {};
    for (const key of Object.keys(defs)) {
      params[key] = overrides[key] ?? defs[key].default;
    }

    return { ...params, ...overrides };
  }

  private createStrategyInstance(
    type: StrategyType,
    params: Record<string, any>,
    context: StrategyContextImpl,
  ): StrategyLifecycle {
    switch (type) {
      case 'bollinger-bands':
        return new BollingerBandsStrategy(params, context);
      case 'rsi-mean-reversion':
        return new RSIMeanReversionStrategy(params, context);
      case 'three-line-momentum':
        return new ThreeLineMomentumStrategy(params, context);
      default:
        return new MACrossStrategy(params, context);
    }
  }

  private createDynamicStrategy(
    script: ScriptMetadataDto,
    context: StrategyContextImpl,
    session: StrategySession,
  ): StrategyLifecycle {
    const definition = this.dynamicStrategyExecutor.load(script.compiledCode);
    session.dynamicStrategy = definition;
    const runtimeContext = context as unknown as Record<string, unknown>;
    return {
      onInit: () => {
        if (typeof definition.onInit === 'function') {
          return Promise.resolve(definition.onInit(runtimeContext));
        }
      },
      onBar: () => Promise.resolve(definition.run(runtimeContext)),
    };
  }

  async dispatchIntent(session: StrategySession, intent: StrategyIntentInput) {
    try {
      const resolvedQuantity = this.resolveIntentQuantity(session, intent);
      if (!resolvedQuantity) {
        this.logger.error(`Invalid intent quantity`, {
          taskId: session.taskId,
          quantity: intent.quantity,
          side: intent.side,
          positionQty: session.account.positionQty,
        });
        return;
      }

      const baseIntent: OrderIntentPayload = {
        intentId: nanoid(),
        strategyId: session.config.strategyId,
        symbol: session.config.datasetId,
        side: intent.side,
        type: intent.type,
        quantity: resolvedQuantity,
        tif: intent.tif ?? 'IOC',
        metadata: intent.reason ? { reason: intent.reason } : undefined,
      };

      const decision: RiskDecisionResult = await session.riskEngine.evaluate(baseIntent);
      if (decision.decision === 'approve' || decision.decision === 'modify') {
        const finalIntent =
          decision.decision === 'modify' && decision.modifiedIntent
            ? { ...baseIntent, ...decision.modifiedIntent }
            : baseIntent;
        const normalized = this.normalizeQuantity(finalIntent.quantity);
        if (!normalized) {
          this.logger.error(`Risk-modified intent quantity invalid`, {
            taskId: session.taskId,
            intentId: finalIntent.intentId,
            quantity: finalIntent.quantity,
            decision: decision.decision,
          });
          return;
        }
        await session.engine.submit({ ...finalIntent, quantity: normalized });
      } else {
        this.logger.warn(`Intent rejected for task ${session.taskId}`, {
          reason: decision.reason,
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to submit intent`, error?.stack || error);
    }
  }

  private enrichBarWithFeatures(session: StrategySession, bar: HistoricalBar) {
    const features: Record<string, any> = {};
    const prices = session.priceHistory;

    if (session.strategyType === 'ma-cross') {
      const fast = this.simpleMovingAverage(prices, session.params.fastPeriod);
      const slow = this.simpleMovingAverage(prices, session.params.slowPeriod);
      if (fast !== undefined) {
        features.fast_ma = fast.toFixed(6);
      }
      if (slow !== undefined) {
        features.slow_ma = slow.toFixed(6);
      }
    } else if (session.strategyType === 'bollinger-bands') {
      const result = this.computeBollinger(
        prices,
        session.params.period ?? 20,
        session.params.stdDev ?? 2,
      );
      if (result) {
        features.bollinger = {
          upper: result.upper.toFixed(6),
          middle: result.middle.toFixed(6),
          lower: result.lower.toFixed(6),
        };
      }
    } else if (session.strategyType === 'rsi-mean-reversion') {
      const rsi = this.computeRsi(prices, session.params.rsiPeriod ?? 14);
      if (rsi !== undefined) {
        features.rsi = rsi.toFixed(2);
      }
    }

    if (Object.keys(features).length === 0) {
      return bar;
    }

    return { ...bar, features };
  }

  private async handleExecutionReport(session: StrategySession, report: ExecutionReportPayload) {
    try {
      session.riskEngine.updateExecution(report as any);
    } catch (error) {
      this.logWithLevel('Risk engine failed to process execution report', 'warn', {
        error: (error as Error)?.message,
      });
    }
    if (!report.lastFill) {
      return;
    }

    const pnl = this.updateAccountWithFill(session, report);
    const positionQty = session.account.positionQty;
    const position =
      positionQty > 0
        ? {
          quantity: positionQty.toFixed(8),
          avgEntryPrice: session.account.avgEntryPrice.toFixed(6),
          side: 'long' as const,
        }
        : undefined;

    const trade: TradeRecord = {
      tradeId: report.lastFill.fillId,
      sessionId: session.sessionId,
      strategyId: session.config.strategyId,
      symbol: report.symbol,
      intentId: report.intentId,
      orderId: report.orderId,
      fillId: report.lastFill.fillId,
      side: report.side,
      type: report.side === 'buy' ? 'open' : 'close',
      quantity: report.lastFill.quantity,
      price: report.lastFill.price,
      realizedPnl: pnl,
      unrealizedPnl: '0',
      fees: report.lastFill.fee?.amount ?? '0',
      feeCurrency: report.lastFill.fee?.asset ?? 'USDT',
      liquidity: report.lastFill.liquidity,
      timestamp: report.lastFill.timestamp,
      sequenceId: report.lastFill.fillId,
      position,
    };

    await session.ledger.recordTrade(trade);
  }

  private updateAccountWithFill(session: StrategySession, report: ExecutionReportPayload): string {
    const fill = report.lastFill!;
    const qty = parseFloat(fill.quantity ?? '0');
    const price = parseFloat(fill.price ?? '0');
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty === 0) {
      this.logger.error('Received invalid fill payload', { fill });
      return '0';
    }

    let realized = 0;
    if (report.side === 'buy') {
      const cost = qty * price;
      const newQty = session.account.positionQty + qty;
      const currentValue = session.account.positionQty * session.account.avgEntryPrice;
      session.account.cash -= cost;
      session.account.avgEntryPrice = newQty === 0 ? 0 : (currentValue + cost) / newQty;
      session.account.positionQty = newQty;
    } else {
      const revenue = qty * price;
      session.account.cash += revenue;
      realized = (price - session.account.avgEntryPrice) * qty;
      session.account.realizedPnl += realized;
      session.account.positionQty = session.account.positionQty - qty;
      if (session.account.positionQty <= 0) {
        session.account.avgEntryPrice = 0;
      }
    }

    session.lastPrice = price;
    return realized.toFixed(2);
  }

  public getEquity(session: StrategySession): number {
    const positionValue = session.account.positionQty * session.lastPrice;
    return session.account.cash + positionValue;
  }

  private toBarEvent(config: TaskConfigDto, bar: HistoricalBar): BarEvent {
    return {
      symbol: config.datasetId,
      timestamp: bar.timestamp,
      open: bar.open.toFixed(6),
      high: bar.high.toFixed(6),
      low: bar.low.toFixed(6),
      close: bar.close.toFixed(6),
      volume: bar.volume.toFixed(6),
    };
  }

  private simpleMovingAverage(values: number[], period: number) {
    if (!period || values.length < period) {
      return undefined;
    }
    const slice = values.slice(-period);
    const sum = slice.reduce((acc, value) => acc + value, 0);
    return sum / slice.length;
  }

  private computeBollinger(values: number[], period: number, stdDev: number) {
    if (!period || values.length < period) {
      return undefined;
    }
    const slice = values.slice(-period);
    const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    const variance =
      slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / slice.length;
    const deviation = Math.sqrt(variance) * stdDev;
    return {
      upper: mean + deviation,
      middle: mean,
      lower: mean - deviation,
    };
  }

  private computeRsi(values: number[], period: number) {
    if (!period || values.length < period + 1) {
      return undefined;
    }

    const slice = values.slice(-period - 1);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < slice.length; i++) {
      const delta = slice[i] - slice[i - 1];
      if (delta >= 0) {
        gains += delta;
      } else {
        losses += Math.abs(delta);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) {
      return 100;
    }
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private normalizeQuantity(quantity: string | number | undefined): string | null {
    if (quantity === undefined) {
      return null;
    }
    const numeric = typeof quantity === 'number' ? quantity : Number(quantity);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return numeric.toFixed(8);
  }

  private resolveIntentQuantity(session: StrategySession, intent: StrategyIntentInput): string | null {
    if (
      typeof intent.quantity === 'string' &&
      intent.quantity.trim().toLowerCase() === 'all'
    ) {
      const positionQty = session.account.positionQty;
      const closable =
        intent.side === 'sell'
          ? Math.max(positionQty, 0)
          : intent.side === 'buy'
            ? Math.max(-positionQty, 0)
            : 0;

      if (closable <= 0) {
        this.logger.warn(`No position to close for intent`, {
          taskId: session.taskId,
          side: intent.side,
          currentPosition: session.account.positionQty,
        });
        return null;
      }
      return closable.toFixed(8);
    }

    return this.normalizeQuantity(intent.quantity);
  }
}
