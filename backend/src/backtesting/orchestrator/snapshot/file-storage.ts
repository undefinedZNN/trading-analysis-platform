/**
 * 文件系统存储引擎实现
 * 
 * 负责快照的持久化存储，包括文件系统操作、目录管理、并发控制等
 * 
 * @module orchestrator/snapshot/file-storage
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type {
  SnapshotStorage,
  SessionSnapshot,
  SnapshotMeta,
} from '../interfaces/snapshot';
import { SnapshotStorageError } from '../interfaces/snapshot';
import type { JsonSerializer } from './json-serializer';

/**
 * 文件存储配置
 */
export interface FileStorageConfig {
  /** 快照根目录 */
  baseDir: string;
  
  /** 是否自动创建目录 */
  autoCreateDir?: boolean;
  
  /** 文件权限 */
  fileMode?: number;
  
  /** 目录权限 */
  dirMode?: number;
  
  /** 重试次数 */
  retryCount?: number;
  
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  
  /** 是否启用文件锁 */
  enableFileLock?: boolean;
}

/**
 * 快照列表选项
 */
export interface ListSnapshotsOptions {
  /** 限制返回数量 */
  limit?: number;
  
  /** 排序方式 */
  sortBy?: 'createdAt' | 'checkpointId';
  
  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 文件存储引擎
 * 
 * 提供快照的文件系统持久化功能
 */
export class FileStorage implements SnapshotStorage {
  private config: Required<FileStorageConfig>;
  private serializer: JsonSerializer;
  private locks: Map<string, Promise<void>> = new Map();
  
  /**
   * 构造函数
   * 
   * @param serializer JSON序列化器
   * @param config 存储配置
   */
  constructor(serializer: JsonSerializer, config: FileStorageConfig) {
    this.serializer = serializer;
    this.config = {
      baseDir: config.baseDir,
      autoCreateDir: config.autoCreateDir ?? true,
      fileMode: config.fileMode ?? 0o644,
      dirMode: config.dirMode ?? 0o755,
      retryCount: config.retryCount ?? 3,
      retryDelay: config.retryDelay ?? 100,
      enableFileLock: config.enableFileLock ?? true,
    };
    
    // 初始化基础目录
    if (this.config.autoCreateDir) {
      this.ensureBaseDir().catch((error) => {
        console.error('Failed to create base directory:', error);
      });
    }
  }
  
  /**
   * 保存快照
   * 
   * @param snapshot 快照数据
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    const { sessionId, checkpointId } = snapshot.meta;
    
    try {
      // 获取文件锁
      await this.acquireLock(sessionId, checkpointId);
      
      // 确保会话目录存在
      await this.ensureSessionDir(sessionId);
      
      // 序列化并压缩快照数据
      const snapshotData = await this.serializer.serializeAndCompress(snapshot);
      
      // 创建元数据
      const meta = this.createMetaData(snapshot);
      const metaJson = JSON.stringify(meta, null, 2);
      
      // 获取文件路径
      const snapshotPath = this.getSnapshotPath(sessionId, checkpointId);
      const metaPath = this.getMetaPath(sessionId, checkpointId);
      
      // 保存文件（带重试）
      await this.writeFileWithRetry(snapshotPath, snapshotData);
      await this.writeFileWithRetry(metaPath, Buffer.from(metaJson, 'utf-8'));
      
      // 设置文件权限
      await fs.chmod(snapshotPath, this.config.fileMode);
      await fs.chmod(metaPath, this.config.fileMode);
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to save snapshot: ${sessionId}/${checkpointId}`,
        error as Error
      );
    } finally {
      // 释放文件锁
      this.releaseLock(sessionId, checkpointId);
    }
  }
  
  /**
   * 加载快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 快照数据
   */
  async load(sessionId: string, checkpointId: string): Promise<SessionSnapshot> {
    try {
      // 获取文件路径
      const snapshotPath = this.getSnapshotPath(sessionId, checkpointId);
      
      // 检查文件是否存在
      await this.checkFileExists(snapshotPath);
      
      // 读取文件（带重试）
      const snapshotData = await this.readFileWithRetry(snapshotPath);
      
      // 解压缩并反序列化
      const snapshot = await this.serializer.decompressAndDeserialize(snapshotData, true);
      
      return snapshot;
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to load snapshot: ${sessionId}/${checkpointId}`,
        error as Error
      );
    }
  }
  
  /**
   * 删除快照
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   */
  async delete(sessionId: string, checkpointId: string): Promise<void> {
    try {
      // 获取文件锁
      await this.acquireLock(sessionId, checkpointId);
      
      // 获取文件路径
      const snapshotPath = this.getSnapshotPath(sessionId, checkpointId);
      const metaPath = this.getMetaPath(sessionId, checkpointId);
      
      // 删除文件（带重试）
      await this.deleteFileWithRetry(snapshotPath);
      await this.deleteFileWithRetry(metaPath);
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to delete snapshot: ${sessionId}/${checkpointId}`,
        error as Error
      );
    } finally {
      // 释放文件锁
      this.releaseLock(sessionId, checkpointId);
    }
  }
  
  /**
   * 列出会话的所有快照
   * 
   * @param sessionId 会话ID
   * @param options 列表选项
   * @returns 快照元数据列表
   */
  async list(sessionId: string, options?: ListSnapshotsOptions): Promise<SnapshotMeta[]> {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      
      // 检查会话目录是否存在
      const exists = await this.dirExists(sessionDir);
      if (!exists) {
        return [];
      }
      
      // 读取目录内容
      const files = await fs.readdir(sessionDir);
      
      // 过滤出元数据文件
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));
      
      // 读取所有元数据
      const metaList: SnapshotMeta[] = [];
      for (const metaFile of metaFiles) {
        const metaPath = path.join(sessionDir, metaFile);
        const metaJson = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaJson) as SnapshotMeta;
        metaList.push(meta);
      }
      
      // 排序
      const sortBy = options?.sortBy || 'createdAt';
      const sortOrder = options?.sortOrder || 'desc';
      metaList.sort((a, b) => {
        const aValue = sortBy === 'createdAt' ? a.createdAt : a.checkpointId;
        const bValue = sortBy === 'createdAt' ? b.createdAt : b.checkpointId;
        return sortOrder === 'asc'
          ? aValue < bValue ? -1 : 1
          : aValue > bValue ? -1 : 1;
      });
      
      // 限制数量
      if (options?.limit) {
        return metaList.slice(0, options.limit);
      }
      
      return metaList;
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to list snapshots: ${sessionId}`,
        error as Error
      );
    }
  }
  
  /**
   * 检查快照是否存在
   * 
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   * @returns 是否存在
   */
  async exists(sessionId: string, checkpointId: string): Promise<boolean> {
    try {
      const snapshotPath = this.getSnapshotPath(sessionId, checkpointId);
      return await this.fileExists(snapshotPath);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 清理会话的所有快照
   * 
   * @param sessionId 会话ID
   */
  async cleanup(sessionId: string): Promise<void> {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      await this.deleteDirectoryRecursive(sessionDir);
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to cleanup session: ${sessionId}`,
        error as Error
      );
    }
  }
  
  /**
   * 获取存储统计信息
   * 
   * @param sessionId 会话ID
   * @returns 统计信息
   */
  async getStats(sessionId: string): Promise<{
    count: number;
    totalSize: number;
    oldestSnapshot?: SnapshotMeta;
    newestSnapshot?: SnapshotMeta;
  }> {
    try {
      const metaList = await this.list(sessionId, { sortBy: 'createdAt', sortOrder: 'asc' });
      
      if (metaList.length === 0) {
        return { count: 0, totalSize: 0 };
      }
      
      // 计算总大小
      let totalSize = 0;
      for (const meta of metaList) {
        const snapshotPath = this.getSnapshotPath(sessionId, meta.checkpointId);
        const stats = await fs.stat(snapshotPath);
        totalSize += stats.size;
      }
      
      return {
        count: metaList.length,
        totalSize,
        oldestSnapshot: metaList[0],
        newestSnapshot: metaList[metaList.length - 1],
      };
    } catch (error) {
      throw new SnapshotStorageError(
        `Failed to get stats: ${sessionId}`,
        error as Error
      );
    }
  }
  
  // ========== 私有方法 ==========
  
  /**
   * 确保基础目录存在
   */
  private async ensureBaseDir(): Promise<void> {
    await this.ensureDir(this.config.baseDir);
  }
  
  /**
   * 确保会话目录存在
   */
  private async ensureSessionDir(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    await this.ensureDir(sessionDir);
  }
  
  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true, mode: this.config.dirMode });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  
  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.config.baseDir, sessionId);
  }
  
  /**
   * 获取快照文件路径
   */
  private getSnapshotPath(sessionId: string, checkpointId: string): string {
    return path.join(
      this.getSessionDir(sessionId),
      `${checkpointId}.snapshot.json.gz`
    );
  }
  
  /**
   * 获取元数据文件路径
   */
  private getMetaPath(sessionId: string, checkpointId: string): string {
    return path.join(
      this.getSessionDir(sessionId),
      `${checkpointId}.meta.json`
    );
  }
  
  /**
   * 创建元数据
   */
  private createMetaData(snapshot: SessionSnapshot): SnapshotMeta {
    return {
      sessionId: snapshot.meta.sessionId,
      checkpointId: snapshot.meta.checkpointId,
      createdAt: snapshot.meta.createdAt,
      version: snapshot.meta.version,
      tags: snapshot.meta.tags,
    };
  }
  
  /**
   * 写入文件（带重试）
   */
  private async writeFileWithRetry(filePath: string, data: Buffer): Promise<void> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < this.config.retryCount; i++) {
      try {
        await fs.writeFile(filePath, data);
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < this.config.retryCount - 1) {
          await this.delay(this.config.retryDelay * (i + 1));
        }
      }
    }
    
    throw new SnapshotStorageError(
      `Failed to write file after ${this.config.retryCount} retries: ${filePath}`,
      lastError
    );
  }
  
  /**
   * 读取文件（带重试）
   */
  private async readFileWithRetry(filePath: string): Promise<Buffer> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < this.config.retryCount; i++) {
      try {
        return await fs.readFile(filePath);
      } catch (error) {
        lastError = error as Error;
        if (i < this.config.retryCount - 1) {
          await this.delay(this.config.retryDelay * (i + 1));
        }
      }
    }
    
    throw new SnapshotStorageError(
      `Failed to read file after ${this.config.retryCount} retries: ${filePath}`,
      lastError
    );
  }
  
  /**
   * 删除文件（带重试）
   */
  private async deleteFileWithRetry(filePath: string): Promise<void> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < this.config.retryCount; i++) {
      try {
        await fs.unlink(filePath);
        return;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // 文件不存在，忽略
          return;
        }
        lastError = error;
        if (i < this.config.retryCount - 1) {
          await this.delay(this.config.retryDelay * (i + 1));
        }
      }
    }
    
    throw new SnapshotStorageError(
      `Failed to delete file after ${this.config.retryCount} retries: ${filePath}`,
      lastError
    );
  }
  
  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fsSync.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查目录是否存在
   */
  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  /**
   * 检查文件存在性并抛出错误
   */
  private async checkFileExists(filePath: string): Promise<void> {
    const exists = await this.fileExists(filePath);
    if (!exists) {
      throw new SnapshotStorageError(`Snapshot file not found: ${filePath}`);
    }
  }
  
  /**
   * 递归删除目录
   */
  private async deleteDirectoryRecursive(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 获取文件锁
   */
  private async acquireLock(sessionId: string, checkpointId: string): Promise<void> {
    if (!this.config.enableFileLock) {
      return;
    }
    
    const lockKey = `${sessionId}/${checkpointId}`;
    
    // 等待现有锁释放
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }
    
    // 创建新锁
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    
    this.locks.set(lockKey, lockPromise);
  }
  
  /**
   * 释放文件锁
   */
  private releaseLock(sessionId: string, checkpointId: string): void {
    if (!this.config.enableFileLock) {
      return;
    }
    
    const lockKey = `${sessionId}/${checkpointId}`;
    this.locks.delete(lockKey);
  }
}

/**
 * 创建文件存储引擎
 * 
 * @param serializer JSON序列化器
 * @param config 存储配置
 * @returns 文件存储引擎实例
 */
export function createFileStorage(
  serializer: JsonSerializer,
  config: FileStorageConfig
): FileStorage {
  return new FileStorage(serializer, config);
}

