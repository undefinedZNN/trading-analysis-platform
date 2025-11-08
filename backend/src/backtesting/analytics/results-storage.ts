/**
 * 结果存储
 * 
 * 提供结果的文件系统存储功能
 * 
 * @module analytics/results-storage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { SessionResults } from './interfaces';

/**
 * 存储配置
 */
export interface StorageConfig {
  baseDir: string;
  maxCacheSize?: number;
}

/**
 * 结果存储接口
 */
export interface ResultsStorage {
  save(sessionId: string, results: SessionResults): Promise<void>;
  load(sessionId: string): Promise<SessionResults | null>;
  exists(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<boolean>;
  list(): Promise<string[]>;
  getMetadata(sessionId: string): Promise<any>;
}

/**
 * 文件系统结果存储实现
 */
export class FileSystemResultsStorage implements ResultsStorage {
  private config: Required<StorageConfig>;

  constructor(config: StorageConfig) {
    this.config = {
      maxCacheSize: 100,
      ...config,
    };
  }

  /**
   * 保存结果
   */
  async save(sessionId: string, results: SessionResults): Promise<void> {
    const filePath = this.getResultsPath(sessionId);
    const dir = path.dirname(filePath);

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf-8');
  }

  /**
   * 加载结果
   */
  async load(sessionId: string): Promise<SessionResults | null> {
    const filePath = this.getResultsPath(sessionId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SessionResults;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 检查结果是否存在
   */
  async exists(sessionId: string): Promise<boolean> {
    const filePath = this.getResultsPath(sessionId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除结果
   */
  async delete(sessionId: string): Promise<boolean> {
    const sessionDir = path.join(this.config.baseDir, sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出所有会话ID
   */
  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.baseDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 获取元数据
   */
  async getMetadata(sessionId: string): Promise<any> {
    const filePath = this.getResultsPath(sessionId);
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取结果文件路径
   */
  private getResultsPath(sessionId: string): string {
    return path.join(this.config.baseDir, sessionId, `results-${sessionId}.json`);
  }
}

