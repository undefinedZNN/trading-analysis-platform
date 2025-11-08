/**
 * 时间对齐工具单元测试
 */

import { TimeAlignmentImpl } from '../time-alignment';

describe('TimeAlignment', () => {
  let timeAlignment: TimeAlignmentImpl;

  beforeEach(() => {
    timeAlignment = new TimeAlignmentImpl();
  });

  describe('parseTimeframe', () => {
    it('应该正确解析预定义的时间框架', () => {
      expect(timeAlignment.parseTimeframe('1s')).toBe(1000);
      expect(timeAlignment.parseTimeframe('1m')).toBe(60 * 1000);
      expect(timeAlignment.parseTimeframe('5m')).toBe(5 * 60 * 1000);
      expect(timeAlignment.parseTimeframe('1h')).toBe(60 * 60 * 1000);
      expect(timeAlignment.parseTimeframe('1d')).toBe(24 * 60 * 60 * 1000);
    });

    it('应该正确解析自定义格式', () => {
      expect(timeAlignment.parseTimeframe('2m')).toBe(2 * 60 * 1000);
      expect(timeAlignment.parseTimeframe('3h')).toBe(3 * 60 * 60 * 1000);
      expect(timeAlignment.parseTimeframe('30s')).toBe(30 * 1000);
    });

    it('应该对无效格式抛出错误', () => {
      expect(() => timeAlignment.parseTimeframe('invalid')).toThrow();
      expect(() => timeAlignment.parseTimeframe('1x')).toThrow();
    });
  });

  describe('alignToTimeframe', () => {
    it('应该正确对齐到时间框架边界（close模式）', () => {
      // 测试 5 分钟对齐
      const timestamp = '2024-01-01T00:02:30.000Z';
      const aligned = timeAlignment.alignToTimeframe(timestamp, '5m', 'close');
      
      // 应该对齐到 00:05:00
      expect(aligned).toBe('2024-01-01T00:05:00.000Z');
    });

    it('应该正确对齐到时间框架边界（open模式）', () => {
      // 测试 5 分钟对齐
      const timestamp = '2024-01-01T00:02:30.000Z';
      const aligned = timeAlignment.alignToTimeframe(timestamp, '5m', 'open');
      
      // 应该对齐到 00:00:00
      expect(aligned).toBe('2024-01-01T00:00:00.000Z');
    });

    it('应该处理已经在边界上的时间戳', () => {
      const timestamp = '2024-01-01T00:05:00.000Z';
      const alignedClose = timeAlignment.alignToTimeframe(timestamp, '5m', 'close');
      const alignedOpen = timeAlignment.alignToTimeframe(timestamp, '5m', 'open');
      
      expect(alignedClose).toBe('2024-01-01T00:10:00.000Z');
      expect(alignedOpen).toBe('2024-01-01T00:05:00.000Z');
    });
  });

  describe('isOnBoundary', () => {
    it('应该正确判断是否在边界上', () => {
      expect(timeAlignment.isOnBoundary('2024-01-01T00:05:00.000Z', '5m')).toBe(true);
      expect(timeAlignment.isOnBoundary('2024-01-01T00:10:00.000Z', '5m')).toBe(true);
      expect(timeAlignment.isOnBoundary('2024-01-01T00:02:30.000Z', '5m')).toBe(false);
      expect(timeAlignment.isOnBoundary('2024-01-01T00:05:01.000Z', '5m')).toBe(false);
    });
  });

  describe('getNextBoundary', () => {
    it('应该返回下一个边界', () => {
      const next = timeAlignment.getNextBoundary('2024-01-01T00:02:30.000Z', '5m');
      expect(next).toBe('2024-01-01T00:05:00.000Z');
    });

    it('如果已经在边界上，应该返回下一个边界', () => {
      const next = timeAlignment.getNextBoundary('2024-01-01T00:05:00.000Z', '5m');
      expect(next).toBe('2024-01-01T00:05:00.000Z');
    });
  });

  describe('getPreviousBoundary', () => {
    it('应该返回上一个边界', () => {
      const prev = timeAlignment.getPreviousBoundary('2024-01-01T00:07:30.000Z', '5m');
      expect(prev).toBe('2024-01-01T00:05:00.000Z');
    });
  });

  describe('getTimeframeMultiplier', () => {
    it('应该返回正确的倍数关系', () => {
      expect(timeAlignment.getTimeframeMultiplier('1m', '5m')).toBe(5);
      expect(timeAlignment.getTimeframeMultiplier('5m', '15m')).toBe(3);
      expect(timeAlignment.getTimeframeMultiplier('1s', '1m')).toBe(60);
    });

    it('如果不是整数倍关系，应该返回 null', () => {
      expect(timeAlignment.getTimeframeMultiplier('7m', '15m')).toBeNull();
      expect(timeAlignment.getTimeframeMultiplier('3m', '5m')).toBeNull();
    });
  });
});

