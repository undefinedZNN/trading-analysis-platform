/**
 * BusStateMachine 单元测试（基于 RunStatus/BusState API）
 */

import { BusStateMachine, StateTransitionError } from '../state-machine';
import type { BusState, RunStatus } from '../interfaces';

describe('BusStateMachine', () => {
  let machine: BusStateMachine;
  let state: BusState;

  beforeEach(() => {
    machine = new BusStateMachine();
    state = machine.createInitialState('session-1');
  });

  it('should create initial idle state', () => {
    expect(state.status).toBe('idle');
    expect(state.sessionId).toBe('session-1');
  });

  describe('valid transitions', () => {
    it('should transition idle -> initializing -> running', () => {
      expect(machine.canTransition(state.status, 'initializing')).toBe(true);
      state = machine.transition(state, 'initializing');
      expect(state.status).toBe('initializing');

      expect(machine.canTransition(state.status, 'running')).toBe(true);
      state = machine.transition(state, 'running');
      expect(state.status).toBe('running');
    });

    it('should handle pause/resume cycle', () => {
      state = machine.transition(state, 'initializing');
      state = machine.transition(state, 'running');

      expect(machine.canTransition(state.status, 'paused')).toBe(true);
      state = machine.transition(state, 'paused');
      expect(state.status).toBe('paused');

      expect(machine.canTransition(state.status, 'running')).toBe(true);
      state = machine.transition(state, 'running');
      expect(state.status).toBe('running');
    });

    it('should transition to stopped and back to idle', () => {
      state = machine.transition(state, 'initializing');
      state = machine.transition(state, 'running');
      state = machine.transition(state, 'stopping');
      expect(state.status).toBe('stopping');

      state = machine.transition(state, 'stopped');
      expect(state.status).toBe('stopped');
      expect(machine.isTerminal(state.status)).toBe(true);

      state = machine.transition(state, 'idle');
      expect(state.status).toBe('idle');
    });
  });

  describe('invalid transitions', () => {
    const expectInvalid = (from: RunStatus, to: RunStatus) => {
      state = { ...state, status: from };
      expect(machine.canTransition(from, to)).toBe(false);
      expect(() => machine.transition(state, to)).toThrow(StateTransitionError);
    };

    it('should not allow pause from idle', () => {
      expectInvalid('idle', 'paused');
    });

    it('should not allow running -> idle directly', () => {
      state = machine.transition(state, 'initializing');
      state = machine.transition(state, 'running');
      expectInvalid('running', 'idle');
    });

    it('should throw for unknown sequence', () => {
      expect(() => machine.transition(state, 'completed')).toThrow(StateTransitionError);
    });
  });

  describe('helper methods', () => {
    it('should report next states for running', () => {
      const next = machine.getNextStates('running');
      expect(next).toEqual(expect.arrayContaining(['paused', 'stopping']));
    });

    it('should validate transition chain', () => {
      expect(
        machine.validateTransitionChain(['idle', 'initializing', 'running', 'stopping', 'stopped'])
      ).toBe(true);
      expect(machine.validateTransitionChain(['idle', 'running'])).toBe(false);
    });

    it('should describe states', () => {
      expect(machine.getStateDescription('running')).toContain('运行');
    });

    it('should evaluate processing capability', () => {
      expect(machine.canAcceptEvents('running')).toBe(true);
      expect(machine.canAcceptEvents('paused')).toBe(false);
      expect(machine.canProcessEvents('stopping')).toBe(true);
    });
  });
});
