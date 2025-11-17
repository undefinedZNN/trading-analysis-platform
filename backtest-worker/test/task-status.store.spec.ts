import 'reflect-metadata';
import { TaskStatus } from '@trading-platform/backtesting-contracts';
import { TaskStatusStore } from '../src/executor/task-status.store';

describe('TaskStatusStore', () => {
  let store: TaskStatusStore;

  beforeEach(() => {
    store = new TaskStatusStore();
  });

  it('should start task as running and then complete', () => {
    store.start('task-1');
    expect(store.getTaskStatus('task-1').status).toBe(TaskStatus.Running);

    store.complete('task-1');
    expect(store.getTaskStatus('task-1').status).toBe(TaskStatus.Completed);
    expect(store.getTaskStatus('task-1').progress).toBe(1);
  });

  it('should mark tasks as failed with error message', () => {
    store.start('task-2');
    store.fail('task-2', new Error('boom'));

    expect(store.getTaskStatus('task-2').status).toBe(TaskStatus.Failed);
    expect(store.getTaskStatus('task-2').error).toContain('boom');
  });

  it('should report aggregated status correctly', () => {
    expect(store.getAggregatedStatus()).toBe('idle');
    store.start('task-3');
    expect(store.getAggregatedStatus()).toBe('busy');
    store.complete('task-3');
    expect(store.getAggregatedStatus()).toBe('idle');
  });
});
