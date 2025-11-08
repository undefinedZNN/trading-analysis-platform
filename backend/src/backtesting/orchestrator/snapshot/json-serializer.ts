/**
 * JSON 序列化器实现
 * 
 * 负责将快照对象序列化为JSON字符串，并支持压缩和解压缩
 * 
 * @module orchestrator/snapshot/json-serializer
 */

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import type {
  SnapshotSerializer,
  SessionSnapshot,
} from '../interfaces/snapshot';
import { SnapshotSerializationError } from '../interfaces/snapshot';

// 异步化 zlib 函数
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * JSON 序列化器配置
 */
export interface JsonSerializerConfig {
  /** 是否美化输出 */
  pretty?: boolean;
  
  /** 缩进空格数 */
  indent?: number;
  
  /** 是否启用压缩 */
  compression?: boolean;
  
  /** 压缩级别 (0-9) */
  compressionLevel?: number;
}

/**
 * JSON 序列化器实现
 * 
 * 提供快照的序列化、反序列化、压缩和解压缩功能
 */
export class JsonSerializer implements SnapshotSerializer {
  private config: Required<JsonSerializerConfig>;
  
  /**
   * 构造函数
   * 
   * @param config 序列化器配置
   */
  constructor(config: JsonSerializerConfig = {}) {
    this.config = {
      pretty: config.pretty ?? false,
      indent: config.indent ?? 2,
      compression: config.compression ?? true,
      compressionLevel: config.compressionLevel ?? 6,
    };
  }
  
  /**
   * 序列化快照
   * 
   * 将快照对象转换为JSON字符串
   * 
   * @param snapshot 快照数据
   * @returns JSON字符串
   * @throws {SnapshotSerializationError} 序列化失败
   */
  serialize(snapshot: SessionSnapshot): string {
    try {
      // 验证快照对象
      this.validateSnapshot(snapshot);
      
      // 序列化为JSON
      const json = this.config.pretty
        ? JSON.stringify(snapshot, null, this.config.indent)
        : JSON.stringify(snapshot);
      
      return json;
    } catch (error) {
      if (error instanceof SnapshotSerializationError) {
        throw error;
      }
      throw new SnapshotSerializationError(
        'Failed to serialize snapshot',
        error as Error
      );
    }
  }
  
  /**
   * 反序列化快照
   * 
   * 将JSON字符串转换为快照对象
   * 
   * @param data JSON字符串
   * @returns 快照对象
   * @throws {SnapshotSerializationError} 反序列化失败
   */
  deserialize(data: string): SessionSnapshot {
    try {
      // 解析JSON
      const snapshot = JSON.parse(data) as SessionSnapshot;
      
      // 验证快照对象
      this.validateSnapshot(snapshot);
      
      return snapshot;
    } catch (error) {
      if (error instanceof SnapshotSerializationError) {
        throw error;
      }
      throw new SnapshotSerializationError(
        'Failed to deserialize snapshot',
        error as Error
      );
    }
  }
  
  /**
   * 压缩数据
   * 
   * 使用GZIP压缩JSON字符串
   * 
   * @param data JSON字符串
   * @returns 压缩后的Buffer
   * @throws {SnapshotSerializationError} 压缩失败
   */
  async compress(data: string): Promise<Buffer> {
    try {
      const buffer = Buffer.from(data, 'utf-8');
      const compressed = await gzipAsync(buffer, {
        level: this.config.compressionLevel,
      });
      return compressed;
    } catch (error) {
      throw new SnapshotSerializationError(
        'Failed to compress data',
        error as Error
      );
    }
  }
  
  /**
   * 解压缩数据
   * 
   * 使用GZIP解压缩数据
   * 
   * @param data 压缩的Buffer
   * @returns JSON字符串
   * @throws {SnapshotSerializationError} 解压缩失败
   */
  async decompress(data: Buffer): Promise<string> {
    try {
      const decompressed = await gunzipAsync(data);
      return decompressed.toString('utf-8');
    } catch (error) {
      throw new SnapshotSerializationError(
        'Failed to decompress data',
        error as Error
      );
    }
  }
  
  /**
   * 序列化并压缩
   * 
   * 将快照序列化为JSON并压缩
   * 
   * @param snapshot 快照对象
   * @returns 压缩后的Buffer
   */
  async serializeAndCompress(snapshot: SessionSnapshot): Promise<Buffer> {
    const json = this.serialize(snapshot);
    
    if (this.config.compression) {
      return this.compress(json);
    }
    
    return Buffer.from(json, 'utf-8');
  }
  
  /**
   * 解压缩并反序列化
   * 
   * 解压缩数据并反序列化为快照对象
   * 
   * @param data 压缩的Buffer
   * @param compressed 数据是否压缩
   * @returns 快照对象
   */
  async decompressAndDeserialize(
    data: Buffer,
    compressed: boolean = true
  ): Promise<SessionSnapshot> {
    let json: string;
    
    if (compressed) {
      json = await this.decompress(data);
    } else {
      json = data.toString('utf-8');
    }
    
    return this.deserialize(json);
  }
  
  /**
   * 验证快照对象
   * 
   * 确保快照对象包含必需的字段
   * 
   * @param snapshot 快照对象
   * @throws {SnapshotSerializationError} 验证失败
   */
  private validateSnapshot(snapshot: any): asserts snapshot is SessionSnapshot {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new SnapshotSerializationError('Snapshot must be an object');
    }
    
    // 验证 meta
    if (!snapshot.meta || typeof snapshot.meta !== 'object') {
      throw new SnapshotSerializationError('Snapshot must have meta object');
    }
    
    const meta = snapshot.meta;
    if (!meta.sessionId || typeof meta.sessionId !== 'string') {
      throw new SnapshotSerializationError('Meta must have sessionId');
    }
    
    if (!meta.checkpointId || typeof meta.checkpointId !== 'string') {
      throw new SnapshotSerializationError('Meta must have checkpointId');
    }
    
    if (!meta.createdAt || typeof meta.createdAt !== 'number') {
      throw new SnapshotSerializationError('Meta must have createdAt timestamp');
    }
    
    if (!meta.version || typeof meta.version !== 'string') {
      throw new SnapshotSerializationError('Meta must have version');
    }
    
    // 验证 modules
    if (!snapshot.modules || typeof snapshot.modules !== 'object') {
      throw new SnapshotSerializationError('Snapshot must have modules object');
    }
    
    // 验证 eventStoreCheckpoint
    if (!snapshot.eventStoreCheckpoint || typeof snapshot.eventStoreCheckpoint !== 'object') {
      throw new SnapshotSerializationError('Snapshot must have eventStoreCheckpoint');
    }
    
    const checkpoint = snapshot.eventStoreCheckpoint;
    if (!checkpoint.lastSequenceId || typeof checkpoint.lastSequenceId !== 'string') {
      throw new SnapshotSerializationError('EventStoreCheckpoint must have lastSequenceId');
    }
    
    if (typeof checkpoint.processedCount !== 'number') {
      throw new SnapshotSerializationError('EventStoreCheckpoint must have processedCount');
    }
  }
  
  /**
   * 获取序列化后的大小（字节）
   * 
   * @param snapshot 快照对象
   * @returns 大小（字节）
   */
  getSerializedSize(snapshot: SessionSnapshot): number {
    const json = this.serialize(snapshot);
    return Buffer.byteLength(json, 'utf-8');
  }
  
  /**
   * 获取压缩后的大小（字节）
   * 
   * @param snapshot 快照对象
   * @returns 压缩后的大小（字节）
   */
  async getCompressedSize(snapshot: SessionSnapshot): Promise<number> {
    const buffer = await this.serializeAndCompress(snapshot);
    return buffer.length;
  }
  
  /**
   * 计算压缩率
   * 
   * @param snapshot 快照对象
   * @returns 压缩率（0-1之间，越小压缩效果越好）
   */
  async getCompressionRatio(snapshot: SessionSnapshot): Promise<number> {
    const originalSize = this.getSerializedSize(snapshot);
    const compressedSize = await this.getCompressedSize(snapshot);
    return compressedSize / originalSize;
  }
}

/**
 * 创建 JSON 序列化器
 * 
 * @param config 配置
 * @returns JSON序列化器实例
 */
export function createJsonSerializer(
  config?: JsonSerializerConfig
): JsonSerializer {
  return new JsonSerializer(config);
}

