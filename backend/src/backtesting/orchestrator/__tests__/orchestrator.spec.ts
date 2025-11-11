/**
 * 编排器单元测试
 */

import { createOrchestrator } from '../orchestrator/orchestrator';
import { createModuleCoordinator } from '../orchestrator/module-coordinator';
import type { BacktestSessionConfig } from '../interfaces/config';
import type { StrategyManifest } from '../../strategy/interfaces';
import {
  SessionNotFoundError,
  SessionAlreadyExistsError,
  SnapshotNotFoundError,
} from '../interfaces/orchestrator';
import { SessionState } from '../interfaces/session';

describe('Orchestrator', () => {
  let orchestrator: ReturnType<typeof createOrchestrator>;
  const manifest: StrategyManifest = {
    strategyId: 'test-strategy',
    name: 'Test Strategy',
    version: '1.0.0',
    description: 'Strategy for orchestrator unit tests',
    author: 'orchestrator-ci',
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
      strategyId: 'test-strategy',
      name: 'Test Strategy',
      scriptContent: 'export default {};',
      manifest,
    },
    execution: {
      initialCapital: '10000',
      matching: {
        marketFillPolicy: 'close',
      },
      slippage: {
        model: 'zero',
      },
      fee: {
        model: 'zero',
      },
    },
    risk: {
      rules: [
        {
          ruleId: 'max-position',
          type: 'max-position',
          enabled: true,
          priority: 1,
          params: { maxPosition: 1 },
        },
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
  
  describe('会话管理', () => {
    it('应该创建会话', async () => {
      const config = createConfig('test-session-1');
      
      const session = await orchestrator.createSession(config);
      
      expect(session).toBeDefined();
      expect(session.getStats().state).toBe(SessionState.Idle);
    });
    
    it('应该抛出异常当会话ID已存在', async () => {
      const config = createConfig('test-session-2');
      
      await orchestrator.createSession(config);
      
      await expect(orchestrator.createSession(config)).rejects.toThrow(
        SessionAlreadyExistsError
      );
    });
    
    it('应该获取会话', async () => {
      const config = createConfig('test-session-3');
      
      await orchestrator.createSession(config);
      
      const session = orchestrator.getSession('test-session-3');
      
      expect(session).toBeDefined();
      expect(session?.getStats().state).toBe(SessionState.Idle);
    });
    
    it('应该返回undefined当会话不存在', () => {
      const session = orchestrator.getSession('non-existent');
      expect(session).toBeUndefined();
    });
    
    it('应该列出所有会话', async () => {
      const config1 = createConfig('test-session-4');
      const config2 = createConfig('test-session-5');
      
      await orchestrator.createSession(config1);
      await orchestrator.createSession(config2);
      
      const sessions = orchestrator.listSessions();
      
      expect(sessions).toHaveLength(2);
    });
  });
  
  describe('生命周期控制', () => {
    it('应该启动会话', async () => {
      const config = createConfig('test-session-6');
      
      await orchestrator.createSession(config);
      await orchestrator.start('test-session-6');
      
      const session = orchestrator.getSession('test-session-6');
      
      // start() 会转换到 Initializing，然后迅速到 Running
      expect([SessionState.Initializing, SessionState.Running]).toContain(
        session?.getStats().state
      );
    });
    
    it('应该抛出异常当启动不存在的会话', async () => {
      await expect(orchestrator.start('non-existent')).rejects.toThrow(
        SessionNotFoundError
      );
    });
    
    it('应该暂停和恢复会话', async () => {
      const config = createConfig('test-session-7');
      
      await orchestrator.createSession(config);
      await orchestrator.start('test-session-7');
      await orchestrator.pause('test-session-7');
      
      let session = orchestrator.getSession('test-session-7');
      expect(session?.getStats().state).toBe(SessionState.Paused);
      
      await orchestrator.resume('test-session-7');
      
      session = orchestrator.getSession('test-session-7');
      expect(session?.getStats().state).toBe(SessionState.Running);
    });
    
    it('应该停止会话', async () => {
      const config = createConfig('test-session-8');
      
      await orchestrator.createSession(config);
      await orchestrator.start('test-session-8');
      await orchestrator.stop('test-session-8');
      
      const session = orchestrator.getSession('test-session-8');
      
      expect([SessionState.Stopped, SessionState.Destroyed]).toContain(
        session?.getStats().state
      );
    });
  });
  
  describe('快照管理', () => {
    it('应该创建快照', async () => {
      const config = createConfig('test-session-9');
      
      await orchestrator.createSession(config);
      
      const checkpointId = await orchestrator.createSnapshot(
        'test-session-9',
        'test snapshot'
      );
      
      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
    });
    
    it('应该列出快照', async () => {
      const config = createConfig('test-session-10');
      
      await orchestrator.createSession(config);
      
      await orchestrator.createSnapshot('test-session-10', 'snapshot 1');
      await orchestrator.createSnapshot('test-session-10', 'snapshot 2');
      
      const snapshots = await orchestrator.listSnapshots('test-session-10');
      
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].reason).toBe('snapshot 2'); // 按创建时间降序
      expect(snapshots[1].reason).toBe('snapshot 1');
    });
    
    it('应该恢复快照', async () => {
      const config = createConfig('test-session-11');
      
      await orchestrator.createSession(config);
      
      const checkpointId = await orchestrator.createSnapshot(
        'test-session-11',
        'test snapshot'
      );
      
      await expect(
        orchestrator.restoreSnapshot('test-session-11', checkpointId)
      ).resolves.not.toThrow();
    });
    
    it('应该抛出异常当恢复不存在的快照', async () => {
      const config = createConfig('test-session-12');
      
      await orchestrator.createSession(config);
      
      await expect(
        orchestrator.restoreSnapshot('test-session-12', 'non-existent')
      ).rejects.toThrow(SnapshotNotFoundError);
    });
  });
  
  describe('结果收集', () => {
    it('应该获取结果', async () => {
      const config = createConfig('test-session-13');
      
      await orchestrator.createSession(config);
      
      const results = await orchestrator.getResults('test-session-13');
      
      expect(results).toBeDefined();
      expect(results.sessionId).toBe('test-session-13');
      expect(results.status).toBeDefined();
      expect(results.stats).toBeDefined();
    });
  });
  
  describe('会话销毁', () => {
    it('应该销毁会话', async () => {
      const config = createConfig('test-session-14');
      
      await orchestrator.createSession(config);
      await orchestrator.destroySession('test-session-14');
      
      const session = orchestrator.getSession('test-session-14');
      expect(session).toBeUndefined();
    });
    
    it('应该销毁所有会话', async () => {
      const config1 = createConfig('test-session-15');
      const config2 = createConfig('test-session-16');
      
      await orchestrator.createSession(config1);
      await orchestrator.createSession(config2);
      
      await orchestrator.destroyAll();
      
      const sessions = orchestrator.listSessions();
      expect(sessions).toHaveLength(0);
    });
  });
});
