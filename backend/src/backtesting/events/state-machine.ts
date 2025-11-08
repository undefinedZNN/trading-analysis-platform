/**
 * 事件总线状态机
 * 
 * 管理回测会话的状态转换，确保状态转换的合法性
 */

import { RunStatus, BusState } from './interfaces';

/**
 * 状态转换错误
 */
export class StateTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
    message?: string
  ) {
    super(message || `Invalid state transition: ${from} -> ${to}`);
    this.name = 'StateTransitionError';
  }
}

/**
 * 事件总线状态机
 */
export class BusStateMachine {
  /**
   * 状态转换规则
   * 每个状态可以转换到哪些状态
   */
  private readonly transitions: ReadonlyMap<RunStatus, ReadonlySet<RunStatus>> = new Map([
    ['idle', new Set(['initializing'])],
    ['initializing', new Set(['running', 'error'])],
    ['running', new Set(['paused', 'stopping', 'completed', 'error'])],
    ['paused', new Set(['running', 'stopping'])],
    ['stopping', new Set(['stopped', 'error'])],
    ['stopped', new Set(['idle'])],
    ['completed', new Set(['idle'])],
    ['error', new Set(['idle', 'stopped'])],
  ]);
  
  /**
   * 终态集合（不能再转换的状态）
   */
  private readonly terminalStates: ReadonlySet<RunStatus> = new Set([
    'stopped',
    'completed',
  ]);
  
  /**
   * 检查状态转换是否合法
   */
  canTransition(from: RunStatus, to: RunStatus): boolean {
    // 相同状态总是允许（幂等）
    if (from === to) {
      return true;
    }
    
    const allowedTransitions = this.transitions.get(from);
    return allowedTransitions?.has(to) || false;
  }
  
  /**
   * 执行状态转换
   */
  transition(state: BusState, to: RunStatus, reason?: string): BusState {
    // 检查转换是否合法
    if (!this.canTransition(state.status, to)) {
      throw new StateTransitionError(
        state.status,
        to,
        reason ? `Transition failed: ${reason}` : undefined
      );
    }
    
    // 如果状态相同，直接返回
    if (state.status === to) {
      return state;
    }
    
    // 创建新状态
    const newState: BusState = {
      ...state,
      status: to,
    };
    
    // 根据目标状态更新时间戳
    switch (to) {
      case 'initializing':
      case 'running':
        if (!newState.startedAt) {
          newState.startedAt = new Date().toISOString();
        }
        // 如果是从暂停恢复，清除暂停时间
        if (state.status === 'paused') {
          newState.pausedAt = undefined;
        }
        break;
      
      case 'paused':
        newState.pausedAt = new Date().toISOString();
        break;
      
      case 'stopped':
      case 'completed':
        newState.completedAt = new Date().toISOString();
        break;
      
      case 'error':
        // 错误状态保留所有时间戳
        break;
    }
    
    return newState;
  }
  
  /**
   * 检查是否为终态
   */
  isTerminal(status: RunStatus): boolean {
    return this.terminalStates.has(status);
  }
  
  /**
   * 检查状态是否可以接收新事件
   */
  canAcceptEvents(status: RunStatus): boolean {
    return status === 'running';
  }
  
  /**
   * 检查状态是否可以处理事件
   */
  canProcessEvents(status: RunStatus): boolean {
    return status === 'running' || status === 'stopping';
  }
  
  /**
   * 获取所有可能的下一个状态
   */
  getNextStates(from: RunStatus): RunStatus[] {
    const nextStates = this.transitions.get(from);
    return nextStates ? Array.from(nextStates) : [];
  }
  
  /**
   * 验证状态转换链
   * 检查一系列状态转换是否都合法
   */
  validateTransitionChain(states: RunStatus[]): boolean {
    if (states.length < 2) {
      return true;
    }
    
    for (let i = 0; i < states.length - 1; i++) {
      if (!this.canTransition(states[i], states[i + 1])) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 创建初始状态
   */
  createInitialState(sessionId: string): BusState {
    return {
      sessionId,
      status: 'idle',
      currentSeq: '0',
      logicalTime: new Date().toISOString(),
      clockMode: 'event',
      inflight: 0,
      processedCount: 0,
    };
  }
  
  /**
   * 获取状态描述
   */
  getStateDescription(status: RunStatus): string {
    const descriptions: Record<RunStatus, string> = {
      idle: '空闲状态，等待开始',
      initializing: '初始化中',
      running: '运行中',
      paused: '已暂停',
      stopping: '正在停止',
      stopped: '已停止',
      completed: '已完成',
      error: '错误状态',
    };
    
    return descriptions[status] || status;
  }
  
  /**
   * 获取状态转换图（用于可视化和调试）
   */
  getTransitionGraph(): Map<RunStatus, RunStatus[]> {
    const graph = new Map<RunStatus, RunStatus[]>();
    
    this.transitions.forEach((toStates, fromState) => {
      graph.set(fromState, Array.from(toStates));
    });
    
    return graph;
  }
  
  /**
   * 生成 Mermaid 状态图
   */
  toMermaidDiagram(): string {
    const lines: string[] = [
      'stateDiagram-v2',
      '  [*] --> idle',
    ];
    
    this.transitions.forEach((toStates, fromState) => {
      toStates.forEach(toState => {
        lines.push(`  ${fromState} --> ${toState}`);
      });
    });
    
    // 添加终态标记
    this.terminalStates.forEach(state => {
      lines.push(`  ${state} --> [*]`);
    });
    
    return lines.join('\n');
  }
}

/**
 * 默认导出单例实例
 */
export const busStateMachine = new BusStateMachine();

