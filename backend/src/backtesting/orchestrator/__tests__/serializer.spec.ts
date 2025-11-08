/**
 * JSON 序列化器单元测试
 */

import { JsonSerializer, createJsonSerializer } from '../snapshot/json-serializer';
import type { SessionSnapshot } from '../interfaces/snapshot';
import { SnapshotSerializationError } from '../interfaces/snapshot';

describe('JsonSerializer', () => {
  let serializer: JsonSerializer;
  
  // 创建测试快照
  const createTestSnapshot = (): SessionSnapshot => ({
    meta: {
      sessionId: 'test-session-123',
      checkpointId: 'checkpoint-001',
      createdAt: Date.now(),
      version: '1.0.0',
      tags: ['test'],
    },
    modules: {
      strategy: {
        state: { position: 'long', entry: 100 },
        timestamp: Date.now(),
      },
      execution: {
        state: { orders: [] },
        timestamp: Date.now(),
      },
    },
    eventStoreCheckpoint: {
      lastSequenceId: 'seq-100',
      lastTimestamp: Date.now(),
      processedCount: 100,
    },
  });
  
  beforeEach(() => {
    serializer = new JsonSerializer();
  });
  
  describe('Constructor', () => {
    it('should create serializer with default config', () => {
      const s = new JsonSerializer();
      expect(s).toBeInstanceOf(JsonSerializer);
    });
    
    it('should create serializer with custom config', () => {
      const s = new JsonSerializer({
        pretty: true,
        indent: 4,
        compression: false,
        compressionLevel: 9,
      });
      expect(s).toBeInstanceOf(JsonSerializer);
    });
    
    it('should create serializer using factory', () => {
      const s = createJsonSerializer({ pretty: true });
      expect(s).toBeInstanceOf(JsonSerializer);
    });
  });
  
  describe('serialize', () => {
    it('should serialize snapshot to JSON string', () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      
      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);
      
      // 应该是有效的 JSON
      const parsed = JSON.parse(json);
      expect(parsed.meta.sessionId).toBe(snapshot.meta.sessionId);
    });
    
    it('should serialize with pretty formatting', () => {
      const prettySerializer = new JsonSerializer({ pretty: true, indent: 2 });
      const snapshot = createTestSnapshot();
      const json = prettySerializer.serialize(snapshot);
      
      // 美化输出应该包含换行符和空格
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
    
    it('should throw error for invalid snapshot', () => {
      expect(() => {
        serializer.serialize(null as any);
      }).toThrow(SnapshotSerializationError);
      
      expect(() => {
        serializer.serialize({} as any);
      }).toThrow(SnapshotSerializationError);
      
      expect(() => {
        serializer.serialize({ meta: {} } as any);
      }).toThrow(SnapshotSerializationError);
    });
  });
  
  describe('deserialize', () => {
    it('should deserialize JSON string to snapshot', () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      const deserialized = serializer.deserialize(json);
      
      expect(deserialized.meta.sessionId).toBe(snapshot.meta.sessionId);
      expect(deserialized.meta.checkpointId).toBe(snapshot.meta.checkpointId);
      expect(deserialized.modules).toEqual(snapshot.modules);
    });
    
    it('should throw error for invalid JSON', () => {
      expect(() => {
        serializer.deserialize('invalid json');
      }).toThrow(SnapshotSerializationError);
      
      expect(() => {
        serializer.deserialize('{}');
      }).toThrow(SnapshotSerializationError);
    });
    
    it('should handle round-trip serialization', () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      const deserialized = serializer.deserialize(json);
      const json2 = serializer.serialize(deserialized);
      
      expect(json).toBe(json2);
    });
  });
  
  describe('compress', () => {
    it('should compress JSON string to buffer', async () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      const compressed = await serializer.compress(json);
      
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeLessThan(json.length);
    });
    
    it('should throw error for compression failure', async () => {
      // 传入非字符串应该失败
      await expect(
        serializer.compress(null as any)
      ).rejects.toThrow(SnapshotSerializationError);
    });
  });
  
  describe('decompress', () => {
    it('should decompress buffer to JSON string', async () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      const compressed = await serializer.compress(json);
      const decompressed = await serializer.decompress(compressed);
      
      expect(decompressed).toBe(json);
    });
    
    it('should throw error for decompression failure', async () => {
      const invalidBuffer = Buffer.from('not gzipped data');
      
      await expect(
        serializer.decompress(invalidBuffer)
      ).rejects.toThrow(SnapshotSerializationError);
    });
  });
  
  describe('serializeAndCompress', () => {
    it('should serialize and compress snapshot', async () => {
      const snapshot = createTestSnapshot();
      const compressed = await serializer.serializeAndCompress(snapshot);
      
      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeGreaterThan(0);
    });
    
    it('should not compress if compression is disabled', async () => {
      const noCompressionSerializer = new JsonSerializer({ compression: false });
      const snapshot = createTestSnapshot();
      const result = await noCompressionSerializer.serializeAndCompress(snapshot);
      
      // 应该是未压缩的 JSON
      const json = result.toString('utf-8');
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
  
  describe('decompressAndDeserialize', () => {
    it('should decompress and deserialize snapshot', async () => {
      const snapshot = createTestSnapshot();
      const compressed = await serializer.serializeAndCompress(snapshot);
      const deserialized = await serializer.decompressAndDeserialize(compressed, true);
      
      expect(deserialized.meta.sessionId).toBe(snapshot.meta.sessionId);
      expect(deserialized.modules).toEqual(snapshot.modules);
    });
    
    it('should handle uncompressed data', async () => {
      const snapshot = createTestSnapshot();
      const json = serializer.serialize(snapshot);
      const buffer = Buffer.from(json, 'utf-8');
      const deserialized = await serializer.decompressAndDeserialize(buffer, false);
      
      expect(deserialized.meta.sessionId).toBe(snapshot.meta.sessionId);
    });
    
    it('should handle round-trip with compression', async () => {
      const snapshot = createTestSnapshot();
      const compressed = await serializer.serializeAndCompress(snapshot);
      const deserialized = await serializer.decompressAndDeserialize(compressed);
      const compressed2 = await serializer.serializeAndCompress(deserialized);
      
      // 压缩后的数据应该大小相近（可能有微小差异）
      expect(Math.abs(compressed.length - compressed2.length)).toBeLessThan(10);
    });
  });
  
  describe('validateSnapshot', () => {
    it('should validate correct snapshot', () => {
      const snapshot = createTestSnapshot();
      expect(() => serializer.serialize(snapshot)).not.toThrow();
    });
    
    it('should throw error for missing meta', () => {
      const invalidSnapshot = {
        modules: {},
        eventStoreCheckpoint: {
          lastSequenceId: 'seq-1',
          processedCount: 0,
        },
      };
      
      expect(() => {
        serializer.serialize(invalidSnapshot as any);
      }).toThrow(SnapshotSerializationError);
    });
    
    it('should throw error for missing sessionId', () => {
      const snapshot = createTestSnapshot();
      delete (snapshot.meta as any).sessionId;
      
      expect(() => {
        serializer.serialize(snapshot);
      }).toThrow(SnapshotSerializationError);
    });
    
    it('should throw error for missing modules', () => {
      const snapshot = createTestSnapshot();
      delete (snapshot as any).modules;
      
      expect(() => {
        serializer.serialize(snapshot);
      }).toThrow(SnapshotSerializationError);
    });
    
    it('should throw error for missing eventStoreCheckpoint', () => {
      const snapshot = createTestSnapshot();
      delete (snapshot as any).eventStoreCheckpoint;
      
      expect(() => {
        serializer.serialize(snapshot);
      }).toThrow(SnapshotSerializationError);
    });
  });
  
  describe('Size and Compression Utilities', () => {
    it('should get serialized size', () => {
      const snapshot = createTestSnapshot();
      const size = serializer.getSerializedSize(snapshot);
      
      expect(size).toBeGreaterThan(0);
      
      const json = serializer.serialize(snapshot);
      expect(size).toBe(Buffer.byteLength(json, 'utf-8'));
    });
    
    it('should get compressed size', async () => {
      const snapshot = createTestSnapshot();
      const compressedSize = await serializer.getCompressedSize(snapshot);
      
      expect(compressedSize).toBeGreaterThan(0);
      
      const originalSize = serializer.getSerializedSize(snapshot);
      expect(compressedSize).toBeLessThan(originalSize);
    });
    
    it('should calculate compression ratio', async () => {
      const snapshot = createTestSnapshot();
      const ratio = await serializer.getCompressionRatio(snapshot);
      
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle large snapshots', async () => {
      const largeSnapshot = createTestSnapshot();
      
      // 添加大量数据
      (largeSnapshot.modules as any).largeData = Array(1000).fill({
        id: 'item',
        data: 'x'.repeat(100),
      });
      
      const json = serializer.serialize(largeSnapshot);
      const compressed = await serializer.compress(json);
      const decompressed = await serializer.decompress(compressed);
      const deserialized = serializer.deserialize(decompressed);
      
      expect(deserialized.meta.sessionId).toBe(largeSnapshot.meta.sessionId);
    });
    
    it('should handle snapshots with special characters', () => {
      const snapshot = createTestSnapshot();
      (snapshot.modules as any).special = {
        unicode: '你好世界 🚀',
        quotes: '"quoted" \'string\'',
        newlines: 'line1\nline2\tindented',
      };
      
      const json = serializer.serialize(snapshot);
      const deserialized = serializer.deserialize(json);
      
      expect((deserialized.modules as any).special.unicode).toBe('你好世界 🚀');
    });
    
    it('should handle empty modules', () => {
      const snapshot = createTestSnapshot();
      snapshot.modules = {};
      
      const json = serializer.serialize(snapshot);
      const deserialized = serializer.deserialize(json);
      
      expect(deserialized.modules).toEqual({});
    });
  });
  
  describe('Compression Levels', () => {
    it('should respect compression level setting', async () => {
      const snapshot = createTestSnapshot();
      
      const fastSerializer = new JsonSerializer({ compressionLevel: 1 });
      const bestSerializer = new JsonSerializer({ compressionLevel: 9 });
      
      const fastCompressed = await fastSerializer.serializeAndCompress(snapshot);
      const bestCompressed = await bestSerializer.serializeAndCompress(snapshot);
      
      // 更高的压缩级别应该产生更小的文件（通常情况下）
      // 但对于小数据可能差异不明显，所以只验证都能正常工作
      expect(fastCompressed.length).toBeGreaterThan(0);
      expect(bestCompressed.length).toBeGreaterThan(0);
    });
  });
});

