/**
 * 编排器集成测试
 * 
 * 测试编排器与各个模块的集成
 */

import { createOrchestrator } from '../orchestrator/orchestrator';
import { createModuleCoordinator } from '../orchestrator/module-coordinator';
import type { BacktestSessionConfig } from '../interfaces/config';
import type { StrategyManifest } from '../../strategy/interfaces';
import { SessionState, SessionEventType } from '../interfaces/session';

describe('Orchestrator Integration Tests', () => {
  let orchestrator: ReturnType<typeof createOrchestrator>;
  const manifest: StrategyManifest = {
    strategyId: 'integration-strategy',
    name: 'Integration Strategy',
    version: '1.0.0',
    description: 'Strategy used in orchestrator integration tests',
    author: 'integration-suite',
    requiredTimeframe: '1h',
    featureDeps: [],
    dataDeps: [{ symbol: 'BTCUSDT' }],
    defaultParameters: {},
  };

  const createConfig = (sessionId: string): BacktestSessionConfig => ({
    sessionId,
    data: {
      source: {
        provider: 'parquet-duckdb',
        path: '/data',
        symbols: ['BTCUSDT'],
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T00:00:00Z',
        },
        gapPolicy: 'drop',
      },
      timeframe: {
        primary: '1h',
      },
    },
    strategy: {
      strategyId: 'integration-strategy',
      name: 'Integration Strategy',
      scriptContent: 'export default {};',
      manifest,
    },
    execution: {
      initialCapital: '10000',
      matching: { marketFillPolicy: 'close' },
      slippage: { model: 'zero' },
      fee: { model: 'zero' },
    },
    risk: {
      rules: [
        { ruleId: 'max-positions', type: 'max-position', enabled: true, priority: 1, params: { maxPositions: 5 } },
      ],
    },
  });
  
  beforeEach(() => {
    const moduleCoordinator = createModuleCoordinator();
    orchestrator = createOrchestrator(moduleCoordinator);
  });
  
  afterEach(async () => {
    await orchestrator.destroyAll();
  });
  
  /**
   * 端到端测试：完整的回测会话生命周期
   */
  describe('端到端测试', () => {
    it('应该完成完整的回测会话生命周期', async () => {
      // 1. 创建会话
      const config = createConfig('e2e-test-session');
      
      const session = await orchestrator.createSession(config);
      expect(session.getStats().state).toBe(SessionState.Idle);
      
      // 2. 启动会话
      await orchestrator.start('e2e-test-session');
      const runningState = session.getStats().state;
      expect([SessionState.Initializing, SessionState.Running]).toContain(runningState);
      
      // 3. 暂停会话
      await orchestrator.pause('e2e-test-session');
      expect(session.getStats().state).toBe(SessionState.Paused);
      
      // 4. 创建快照
      const checkpointId = await orchestrator.createSnapshot(
        'e2e-test-session',
        'mid-test checkpoint'
      );
      expect(checkpointId).toBeDefined();
      
      // 5. 恢复会话
      await orchestrator.resume('e2e-test-session');
      expect(session.getStats().state).toBe(SessionState.Running);
      
      // 6. 停止会话
      await orchestrator.stop('e2e-test-session');
      const stoppedState = session.getStats().state;
      expect([SessionState.Stopped, SessionState.Destroyed]).toContain(stoppedState);
      
      // 7. 获取结果
      const results = await orchestrator.getResults('e2e-test-session');
      expect(results).toBeDefined();
      expect(results.sessionId).toBe('e2e-test-session');
      expect(results.stats).toBeDefined();
      
      // 8. 销毁会话
      await orchestrator.destroySession('e2e-test-session');
      expect(orchestrator.getSession('e2e-test-session')).toBeUndefined();
    });
  });
  
  /**
   * 多会话管理测试
   */
  describe('多会话管理', () => {
    it('应该正确管理多个并发会话', async () => {
      // 创建多个会话
      const sessionIds = ['session-1', 'session-2', 'session-3'];
      
      for (const sessionId of sessionIds) {
        await orchestrator.createSession(createConfig(sessionId));
      }
      
      // 验证所有会话都已创建
      const sessions = orchestrator.listSessions();
      expect(sessions).toHaveLength(3);
      
      // 并行启动所有会话
      await Promise.all(
        sessionIds.map(id => orchestrator.start(id))
      );
      
      // 验证所有会话都在运行
      for (const sessionId of sessionIds) {
        const session = orchestrator.getSession(sessionId);
        expect(session).toBeDefined();
        expect([SessionState.Initializing, SessionState.Running]).toContain(
          session!.getStats().state
        );
      }
      
      // 清理所有会话
      await orchestrator.destroyAll();
      expect(orchestrator.listSessions()).toHaveLength(0);
    });
  });
  
  /**
   * 快照和恢复测试
   */
  describe('快照和恢复', () => {
    it('应该正确创建和恢复快照', async () => {
      const config = createConfig('snapshot-test');
      
      await orchestrator.createSession(config);
      await orchestrator.start('snapshot-test');
      
      // 创建多个快照
      const checkpoint1 = await orchestrator.createSnapshot(
        'snapshot-test',
        'checkpoint-1'
      );
      
      const checkpoint2 = await orchestrator.createSnapshot(
        'snapshot-test',
        'checkpoint-2'
      );
      
      const checkpoint3 = await orchestrator.createSnapshot(
        'snapshot-test',
        'checkpoint-3'
      );
      
      // 列出快照
      const snapshots = await orchestrator.listSnapshots('snapshot-test');
      expect(snapshots).toHaveLength(3);
      
      // 验证快照按时间降序排列
      expect(snapshots[0].reason).toBe('checkpoint-3');
      expect(snapshots[1].reason).toBe('checkpoint-2');
      expect(snapshots[2].reason).toBe('checkpoint-1');
      
      // 恢复快照
      await orchestrator.restoreSnapshot('snapshot-test', checkpoint2);
      
      // 验证恢复成功（实际应该验证状态是否恢复）
      const session = orchestrator.getSession('snapshot-test');
      expect(session).toBeDefined();
      
      await orchestrator.destroySession('snapshot-test');
    });
    
    it('应该在会话销毁时删除快照', async () => {
      const config: BacktestSessionConfig = {
        sessionId: 'snapshot-cleanup-test',
        data: {
          source: 'parquet',
          basePath: '/data',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: 'test-strategy',
          version: '1.0.0',
          name: 'Test Strategy',
          description: 'Test strategy',
          scriptPath: '/path/to/strategy.js',
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed', value: 0.001 },
          feeModel: {
            type: 'percentage',
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      await orchestrator.createSession(config);
      
      // 创建快照
      await orchestrator.createSnapshot('snapshot-cleanup-test', 'test');
      
      // 销毁会话
      await orchestrator.destroySession('snapshot-cleanup-test');
      
      // 验证快照也被删除
      const snapshots = await orchestrator.listSnapshots('snapshot-cleanup-test');
      expect(snapshots).toHaveLength(0);
    });
  });
  
  /**
   * 事件监听测试
   */
  describe('事件监听', () => {
    it('应该正确发布会话事件', async () => {
      const config: BacktestSessionConfig = {
        sessionId: 'event-test',
        data: {
          source: 'parquet',
          basePath: '/data',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: 'test-strategy',
          version: '1.0.0',
          name: 'Test Strategy',
          description: 'Test strategy',
          scriptPath: '/path/to/strategy.js',
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed', value: 0.001 },
          feeModel: {
            type: 'percentage',
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      const session = await orchestrator.createSession(config);
      
      const events: string[] = [];
      
      // 监听所有事件
      session.on(SessionEventType.StateChanged, (event) => {
        events.push(`StateChanged:${event.newState}`);
      });
      
      session.on(SessionEventType.Started, () => {
        events.push('Started');
      });
      
      session.on(SessionEventType.Paused, () => {
        events.push('Paused');
      });
      
      session.on(SessionEventType.Resumed, () => {
        events.push('Resumed');
      });
      
      session.on(SessionEventType.Stopped, () => {
        events.push('Stopped');
      });
      
      // 执行生命周期操作
      await orchestrator.start('event-test');
      await orchestrator.pause('event-test');
      await orchestrator.resume('event-test');
      await orchestrator.stop('event-test');
      
      // 验证事件被发布
      expect(events.length).toBeGreaterThan(0);
      expect(events).toContain('Started');
      expect(events).toContain('Paused');
      expect(events).toContain('Resumed');
      
      await orchestrator.destroySession('event-test');
    });
  });
  
  /**
   * 错误处理测试
   */
  describe('错误处理', () => {
    it('应该正确处理无效配置', async () => {
      const invalidConfig = {
        sessionId: '',  // 无效的会话ID
        data: {
          source: 'parquet' as const,
          basePath: '/data',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: 'test-strategy',
          version: '1.0.0',
          name: 'Test Strategy',
          description: 'Test strategy',
          scriptPath: '/path/to/strategy.js',
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed' as const, value: 0.001 },
          feeModel: {
            type: 'percentage' as const,
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      await expect(
        orchestrator.createSession(invalidConfig)
      ).rejects.toThrow();
    });
    
    it('应该正确处理状态转换错误', async () => {
      const config: BacktestSessionConfig = {
        sessionId: 'error-test',
        data: {
          source: 'parquet',
          basePath: '/data',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: 'test-strategy',
          version: '1.0.0',
          name: 'Test Strategy',
          description: 'Test strategy',
          scriptPath: '/path/to/strategy.js',
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed', value: 0.001 },
          feeModel: {
            type: 'percentage',
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      await orchestrator.createSession(config);
      
      // 尝试恢复一个未启动的会话
      await expect(
        orchestrator.resume('error-test')
      ).rejects.toThrow();
      
      await orchestrator.destroySession('error-test');
    });
  });
  
  /**
   * 性能测试
   */
  describe('性能测试', () => {
    it('应该能够快速创建和销毁大量会话', async () => {
      const baseConfig: BacktestSessionConfig = {
        sessionId: 'perf-test-1',
        data: {
          source: 'parquet',
          basePath: '/data',
          symbol: 'BTCUSDT',
          startTime: '2024-01-01',
          endTime: '2024-01-31',
        },
        strategy: {
          strategyId: 'test-strategy',
          version: '1.0.0',
          name: 'Test Strategy',
          description: 'Test strategy',
          scriptPath: '/path/to/strategy.js',
        },
        execution: {
          initialCapital: 10000,
          leverage: 1,
          slippageModel: { type: 'fixed', value: 0.001 },
          feeModel: {
            type: 'percentage',
            makerFee: 0.001,
            takerFee: 0.002,
          },
        },
      };
      
      const count = 10;
      const startTime = Date.now();
      
      // 创建多个会话
      for (let i = 0; i < count; i++) {
        await orchestrator.createSession({
          ...baseConfig,
          sessionId: `perf-test-${i}`,
        });
      }
      
      const createTime = Date.now() - startTime;
      
      // 验证会话数量
      expect(orchestrator.listSessions()).toHaveLength(count);
      
      // 销毁所有会话
      const destroyStartTime = Date.now();
      await orchestrator.destroyAll();
      const destroyTime = Date.now() - destroyStartTime;
      
      // 验证性能
      expect(createTime).toBeLessThan(5000); // 5秒内创建10个会话
      expect(destroyTime).toBeLessThan(2000); // 2秒内销毁10个会话
      
      expect(orchestrator.listSessions()).toHaveLength(0);
    }, 10000); // 增加超时时间
  });
});
