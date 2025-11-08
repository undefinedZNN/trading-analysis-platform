/**
 * BusStateMachine 单元测试
 */

import { BusStateMachine } from '../state-machine';
import type { RunStatus } from '../interfaces';

describe('BusStateMachine', () => {
  let stateMachine: BusStateMachine;

  beforeEach(() => {
    stateMachine = new BusStateMachine();
  });

  describe('初始状态', () => {
    it('should start in idle state', () => {
      expect(stateMachine.getStatus()).toBe('idle');
    });
  });

  describe('状态转换', () => {
    it('should transition from idle to running on start', () => {
      expect(stateMachine.canTransition('start')).toBe(true);
      stateMachine.transition('start');
      expect(stateMachine.getStatus()).toBe('running');
    });

    it('should transition from running to paused on pause', () => {
      stateMachine.transition('start');
      expect(stateMachine.canTransition('pause')).toBe(true);
      stateMachine.transition('pause');
      expect(stateMachine.getStatus()).toBe('paused');
    });

    it('should transition from paused to running on resume', () => {
      stateMachine.transition('start');
      stateMachine.transition('pause');
      expect(stateMachine.canTransition('resume')).toBe(true);
      stateMachine.transition('resume');
      expect(stateMachine.getStatus()).toBe('running');
    });

    it('should transition from running to stopped on stop', () => {
      stateMachine.transition('start');
      expect(stateMachine.canTransition('stop')).toBe(true);
      stateMachine.transition('stop');
      expect(stateMachine.getStatus()).toBe('stopped');
    });

    it('should transition from stopped to idle on reset', () => {
      stateMachine.transition('start');
      stateMachine.transition('stop');
      expect(stateMachine.canTransition('reset')).toBe(true);
      stateMachine.transition('reset');
      expect(stateMachine.getStatus()).toBe('idle');
    });
  });

  describe('非法状态转换', () => {
    it('should not allow pause from idle', () => {
      expect(stateMachine.canTransition('pause')).toBe(false);
      expect(() => stateMachine.transition('pause')).toThrow();
    });

    it('should not allow resume from idle', () => {
      expect(stateMachine.canTransition('resume')).toBe(false);
      expect(() => stateMachine.transition('resume')).toThrow();
    });

    it('should not allow start from running', () => {
      stateMachine.transition('start');
      expect(stateMachine.canTransition('start')).toBe(false);
      expect(() => stateMachine.transition('start')).toThrow();
    });

    it('should not allow reset from running', () => {
      stateMachine.transition('start');
      expect(stateMachine.canTransition('reset')).toBe(false);
      expect(() => stateMachine.transition('reset')).toThrow();
    });
  });

  describe('复杂状态流', () => {
    it('should handle start -> pause -> resume -> stop -> reset', () => {
      stateMachine.transition('start');
      expect(stateMachine.getStatus()).toBe('running');

      stateMachine.transition('pause');
      expect(stateMachine.getStatus()).toBe('paused');

      stateMachine.transition('resume');
      expect(stateMachine.getStatus()).toBe('running');

      stateMachine.transition('stop');
      expect(stateMachine.getStatus()).toBe('stopped');

      stateMachine.transition('reset');
      expect(stateMachine.getStatus()).toBe('idle');
    });

    it('should handle multiple pause/resume cycles', () => {
      stateMachine.transition('start');

      for (let i = 0; i < 3; i++) {
        stateMachine.transition('pause');
        expect(stateMachine.getStatus()).toBe('paused');

        stateMachine.transition('resume');
        expect(stateMachine.getStatus()).toBe('running');
      }
    });
  });

  describe('错误处理', () => {
    it('should throw error for invalid action', () => {
      expect(() => stateMachine.transition('invalid' as any)).toThrow();
    });

    it('should throw error for invalid transition', () => {
      // Try to pause from idle
      expect(() => stateMachine.transition('pause')).toThrow(
        /Invalid transition/
      );
    });
  });
});

