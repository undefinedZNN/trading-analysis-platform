/**
 * CompareCacheService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CompareCacheService } from './compare-cache.service';
import { CompareMode, CompareVersionsResponseDto } from '../dto/version-compare.dto';

describe('CompareCacheService', () => {
  let service: CompareCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompareCacheService],
    }).compile();

    service = module.get<CompareCacheService>(CompareCacheService);
  });

  afterEach(() => {
    service.clear();
    service.stopCleanup();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get and set', () => {
    it('should return null for non-existent cache', () => {
      const result = service.get('strategy-1', 'v1', 'v2', CompareMode.FULL);
      expect(result).toBeNull();
    });

    it('should store and retrieve cache', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: true,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      const result = service.get('strategy-1', 'v1', 'v2', CompareMode.FULL);

      expect(result).toEqual(mockData);
    });

    it('should return null for expired cache', async () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      // 设置1毫秒的TTL
      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData, 1);

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = service.get('strategy-1', 'v1', 'v2', CompareMode.FULL);
      expect(result).toBeNull();
    });

    it('should handle different compare modes separately', () => {
      const mockDataFull: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: true,
      };

      const mockDataCode: CompareVersionsResponseDto = {
        ...mockDataFull,
        mode: CompareMode.CODE,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockDataFull);
      service.set('strategy-1', 'v1', 'v2', CompareMode.CODE, mockDataCode);

      const resultFull = service.get('strategy-1', 'v1', 'v2', CompareMode.FULL);
      const resultCode = service.get('strategy-1', 'v1', 'v2', CompareMode.CODE);

      expect(resultFull?.mode).toBe(CompareMode.FULL);
      expect(resultCode?.mode).toBe(CompareMode.CODE);
    });
  });

  describe('invalidateStrategy', () => {
    it('should invalidate all cache entries for a strategy', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      service.set('strategy-1', 'v2', 'v3', CompareMode.FULL, mockData);
      service.set('strategy-2', 'v1', 'v2', CompareMode.FULL, mockData);

      const count = service.invalidateStrategy('strategy-1');

      expect(count).toBe(2);
      expect(service.get('strategy-1', 'v1', 'v2', CompareMode.FULL)).toBeNull();
      expect(service.get('strategy-1', 'v2', 'v3', CompareMode.FULL)).toBeNull();
      expect(service.get('strategy-2', 'v1', 'v2', CompareMode.FULL)).not.toBeNull();
    });
  });

  describe('invalidateVersion', () => {
    it('should invalidate cache entries containing the version', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      service.set('strategy-1', 'v2', 'v3', CompareMode.FULL, mockData);
      service.set('strategy-1', 'v3', 'v4', CompareMode.FULL, mockData);

      const count = service.invalidateVersion('strategy-1', 'v2');

      expect(count).toBe(2); // v1-v2 and v2-v3
      expect(service.get('strategy-1', 'v1', 'v2', CompareMode.FULL)).toBeNull();
      expect(service.get('strategy-1', 'v2', 'v3', CompareMode.FULL)).toBeNull();
      expect(service.get('strategy-1', 'v3', 'v4', CompareMode.FULL)).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      service.set('strategy-2', 'v1', 'v2', CompareMode.FULL, mockData);

      service.clear();

      expect(service.get('strategy-1', 'v1', 'v2', CompareMode.FULL)).toBeNull();
      expect(service.get('strategy-2', 'v1', 'v2', CompareMode.FULL)).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      service.get('strategy-1', 'v1', 'v2', CompareMode.FULL); // hit
      service.get('strategy-1', 'v1', 'v3', CompareMode.FULL); // miss

      const stats = service.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50);
      expect(stats.entryCount).toBe(1);
      expect(stats.estimatedSize).toBeGreaterThan(0);
    });

    it('should handle zero requests', () => {
      const stats = service.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', () => {
      const mockData: CompareVersionsResponseDto = {
        strategyId: 'strategy-1',
        sourceVersion: {
          id: 'v1',
          version: '1.0.0',
          createdAt: '2025-11-01T00:00:00Z',
        },
        targetVersion: {
          id: 'v2',
          version: '2.0.0',
          createdAt: '2025-11-02T00:00:00Z',
        },
        mode: CompareMode.FULL,
        comparedAt: '2025-11-10T00:00:00Z',
        hasDifferences: false,
      };

      service.set('strategy-1', 'v1', 'v2', CompareMode.FULL, mockData);
      service.get('strategy-1', 'v1', 'v2', CompareMode.FULL);

      service.resetStats();

      const stats = service.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
});

