/**
 * 会话状态机实现
 * 
 * 管理会话状态转换和验证
 * 
 * @module orchestrator/session/session-state-machine
 */

import {
  SessionState,
  ALLOWED_STATE_TRANSITIONS,
  InvalidStateTransitionError,
} from '../interfaces/session';

// ============================================================================
// 状态机实现
// ============================================================================

/**
 * 会话状态机
 */
export class SessionStateMachine {
  /** 当前状态 */
  private currentState: SessionState;
  
  /** 状态历史 */
  private stateHistory: Array<{ state: SessionState; timestamp: number; reason?: string }> = [];
  
  /**
   * 构造函数
   * 
   * @param initialState 初始状态
   */
  constructor(initialState: SessionState = SessionState.Idle) {
    this.currentState = initialState;
    this.stateHistory.push({
      state: initialState,
      timestamp: Date.now(),
      reason: 'Initial state',
    });
  }
  
  /**
   * 获取当前状态
   */
  getState(): SessionState {
    return this.currentState;
  }
  
  /**
   * 检查是否可以转换到目标状态
   * 
   * @param toState 目标状态
   * @returns 是否允许转换
   */
  canTransitionTo(toState: SessionState): boolean {
    const allowedStates = ALLOWED_STATE_TRANSITIONS[this.currentState];
    return allowedStates.includes(toState);
  }
  
  /**
   * 转换到新状态
   * 
   * @param toState 目标状态
   * @param reason 转换原因
   * @throws {InvalidStateTransitionError} 如果转换不允许
   */
  transitionTo(toState: SessionState, reason?: string): void {
    if (!this.canTransitionTo(toState)) {
      throw new InvalidStateTransitionError(this.currentState, toState);
    }
    
    const previousState = this.currentState;
    this.currentState = toState;
    
    this.stateHistory.push({
      state: toState,
      timestamp: Date.now(),
      reason: reason || `Transition from ${previousState}`,
    });
  }
  
  /**
   * 获取状态历史
   * 
   * @returns 状态历史
   */
  getHistory(): Array<{ state: SessionState; timestamp: number; reason?: string }> {
    return [...this.stateHistory];
  }
  
  /**
   * 获取之前的状态
   * 
   * @returns 之前的状态或 undefined
   */
  getPreviousState(): SessionState | undefined {
    if (this.stateHistory.length < 2) {
      return undefined;
    }
    return this.stateHistory[this.stateHistory.length - 2].state;
  }
  
  /**
   * 检查是否处于活跃状态
   * 
   * @returns 是否活跃
   */
  isActive(): boolean {
    return this.currentState === SessionState.Running;
  }
  
  /**
   * 检查是否已完成
   * 
   * @returns 是否完成
   */
  isCompleted(): boolean {
    return (
      this.currentState === SessionState.Completed ||
      this.currentState === SessionState.Failed
    );
  }
  
  /**
   * 检查是否已销毁
   * 
   * @returns 是否销毁
   */
  isDestroyed(): boolean {
    return this.currentState === SessionState.Destroyed;
  }
  
  /**
   * 重置状态机（用于测试）
   * 
   * @param state 重置到的状态
   */
  reset(state: SessionState = SessionState.Idle): void {
    this.currentState = state;
    this.stateHistory = [{
      state,
      timestamp: Date.now(),
      reason: 'Reset',
    }];
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建状态机
 * 
 * @param initialState 初始状态
 * @returns 状态机实例
 */
export function createStateMachine(initialState?: SessionState): SessionStateMachine {
  return new SessionStateMachine(initialState);
}

/**
 * 验证状态转换
 * 
 * @param from 起始状态
 * @param to 目标状态
 * @returns 是否允许
 */
export function isValidTransition(from: SessionState, to: SessionState): boolean {
  const allowedStates = ALLOWED_STATE_TRANSITIONS[from];
  return allowedStates.includes(to);
}

/**
 * 获取允许的下一个状态
 * 
 * @param currentState 当前状态
 * @returns 允许的状态列表
 */
export function getAllowedNextStates(currentState: SessionState): SessionState[] {
  return ALLOWED_STATE_TRANSITIONS[currentState] || [];
}

