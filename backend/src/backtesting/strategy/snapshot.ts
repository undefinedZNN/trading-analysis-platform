/**
 * 快照管理器
 * 
 * 负责策略状态的序列化和恢复
 */

import type {
  StrategyInstance,
  StrategyContext,
  StrategySnapshot,
} from './interfaces';

/**
 * 快照管理器
 */
export class SnapshotManager {
  /**
   * 创建快照
   * @param instance 策略实例
   * @param context 策略上下文
   * @param lastSequenceId 最后处理的序列号
   */
  async createSnapshot(
    instance: StrategyInstance,
    context: StrategyContext,
    lastSequenceId: string
  ): Promise<StrategySnapshot> {
    // 1. 调用策略的 onSnapshot（如果实现）
    let strategyState: Record<string, unknown> = {};
    
    if (instance.lifecycle.onSnapshot) {
      try {
        const snapshot = await Promise.resolve(
          instance.lifecycle.onSnapshot(context)
        );
        strategyState = snapshot.state || {};
      } catch (error: any) {
        context.log('warn', `Failed to create strategy snapshot: ${error.message}`);
        // 继续执行，使用空状态
      }
    }

    // 2. 序列化共享状态
    const sharedState = await this.serializeSharedState(context.sharedState);

    // 3. 组装快照
    const snapshot: StrategySnapshot = {
      state: strategyState,
      sharedState,
      createdAt: context.now(),
      lastSequenceId,
    };

    context.log('info', 'Snapshot created', {
      sequenceId: lastSequenceId,
      stateKeys: Object.keys(strategyState).length,
      sharedStateKeys: Object.keys(sharedState).length,
    });

    return snapshot;
  }

  /**
   * 恢复快照
   * @param instance 策略实例
   * @param context 策略上下文
   * @param snapshot 快照数据
   */
  async restoreSnapshot(
    instance: StrategyInstance,
    context: StrategyContext,
    snapshot: StrategySnapshot
  ): Promise<void> {
    // 1. 恢复共享状态
    await this.restoreSharedState(context.sharedState, snapshot.sharedState);

    // 2. 调用策略的 onRestore（如果实现）
    if (instance.lifecycle.onRestore) {
      try {
        await Promise.resolve(
          instance.lifecycle.onRestore(context, snapshot)
        );
        context.log('info', 'Snapshot restored', {
          createdAt: snapshot.createdAt,
          lastSequenceId: snapshot.lastSequenceId,
        });
      } catch (error: any) {
        context.log('error', `Failed to restore snapshot: ${error.message}`);
        throw error;
      }
    } else {
      context.log('warn', 'Strategy does not implement onRestore');
    }
  }

  /**
   * 序列化共享状态
   * @param sharedState 共享状态 Map
   * @private
   */
  private async serializeSharedState(
    sharedState: Map<string, any>
  ): Promise<Record<string, unknown>> {
    const serialized: Record<string, unknown> = {};

    for (const [key, observable] of sharedState.entries()) {
      try {
        // 对于 Observable，我们需要获取其当前值
        // 这里假设它是 BehaviorSubject 或有 .value 属性
        if ('value' in observable) {
          serialized[key] = (observable as any).value;
        } else {
          // 如果不是 BehaviorSubject，记录警告并跳过
          console.warn(`Cannot serialize shared state: ${key} (not a BehaviorSubject)`);
        }
      } catch (error: any) {
        console.warn(`Failed to serialize shared state ${key}: ${error.message}`);
      }
    }

    return serialized;
  }

  /**
   * 恢复共享状态
   * @param sharedState 共享状态 Map
   * @param serialized 序列化数据
   * @private
   */
  private async restoreSharedState(
    sharedState: Map<string, any>,
    serialized: Record<string, unknown>
  ): Promise<void> {
    for (const [key, value] of Object.entries(serialized)) {
      try {
        const observable = sharedState.get(key);
        if (observable && 'next' in observable) {
          // 如果是 Subject，发送新值
          (observable as any).next(value);
        } else {
          console.warn(`Shared state ${key} not found or not writable`);
        }
      } catch (error: any) {
        console.warn(`Failed to restore shared state ${key}: ${error.message}`);
      }
    }
  }

  /**
   * 验证快照
   * @param snapshot 快照数据
   */
  validateSnapshot(snapshot: StrategySnapshot): boolean {
    if (!snapshot) {
      return false;
    }

    if (!snapshot.state || typeof snapshot.state !== 'object') {
      return false;
    }

    if (!snapshot.sharedState || typeof snapshot.sharedState !== 'object') {
      return false;
    }

    if (!snapshot.createdAt) {
      return false;
    }

    if (!snapshot.lastSequenceId) {
      return false;
    }

    return true;
  }

  /**
   * 克隆快照
   * @param snapshot 原始快照
   */
  cloneSnapshot(snapshot: StrategySnapshot): StrategySnapshot {
    return {
      state: JSON.parse(JSON.stringify(snapshot.state)),
      sharedState: JSON.parse(JSON.stringify(snapshot.sharedState)),
      createdAt: snapshot.createdAt,
      lastSequenceId: snapshot.lastSequenceId,
      extra: snapshot.extra ? JSON.parse(JSON.stringify(snapshot.extra)) : undefined,
    };
  }
}

