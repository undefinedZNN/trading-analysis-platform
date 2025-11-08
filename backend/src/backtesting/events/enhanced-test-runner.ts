/**
 * 增强版 EventStore 测试运行器
 */

import { EnhancedEventStore } from './enhanced-store';
import * as fs from 'fs';
import * as path from 'path';

// === 测试辅助函数 ===

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(
  description: string,
  fn: () => void | Promise<void>
): Promise<void> {
  testCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passCount++;
    console.log(`✅ ${description}`);
  } catch (error: any) {
    failCount++;
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
  }
}

// === 清理测试目录 ===

const testDataDir = './test-data/enhanced-events';
const testBackupDir = './test-data/enhanced-backups';

function cleanupTestDirs(): void {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  if (fs.existsSync(testBackupDir)) {
    fs.rmSync(testBackupDir, { recursive: true, force: true });
  }
}

// === 测试套件 ===

async function runTests(): Promise<void> {
  console.log('\n=== 增强版 EventStore 测试 ===\n');

  cleanupTestDirs();

  // === 基础功能测试 ===

  console.log('## 基础功能测试\n');

  await test('可以创建增强版 EventStore', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: false,
    });
    assert(store.getEventCount() === 0, 'Event count should be 0');
    store.destroy();
  });

  await test('可以追加和查询事件', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: false,
    });

    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    assert(store.getEventCount() === 10, 'Event count should be 10');

    const events = store.getRange(2, 5);
    assert(events.length === 4, 'Should have 4 events in range');

    store.destroy();
  });

  // === Parquet 持久化测试 ===

  console.log('\n## Parquet 持久化测试\n');

  await test('可以将事件刷盘到 Parquet 文件', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: true,
      flushBatchSize: 5,
      autoFlushIntervalMs: 10000, // 设置很大，避免自动刷盘
    });

    // 追加5个事件触发自动刷盘
    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 等待刷盘完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 检查文件是否创建
    const files = fs.existsSync(testDataDir)
      ? fs.readdirSync(testDataDir)
      : [];
    const parquetFiles = files.filter((f) => f.endsWith('.parquet'));

    assert(parquetFiles.length > 0, 'Should have at least one Parquet file');

    // 检查文件元数据
    const storeFiles = store.getFiles();
    assert(storeFiles.length > 0, 'Should have file metadata');
    assert(storeFiles[0].eventCount === 5, 'File should have 5 events');
    assert(storeFiles[0].fileSize > 0, 'File should have size > 0');

    store.destroy();
  });

  await test('可以使用 GZIP 压缩', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: true,
      enableCompression: true,
      compressionType: 'GZIP',
      flushBatchSize: 10,
    });

    // 追加10个事件
    for (let i = 0; i < 10; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: {
          index: i,
          data: 'x'.repeat(1000), // 添加大量数据以测试压缩
        },
      });
    }

    // 等待刷盘完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    const storeFiles = store.getFiles();
    assert(storeFiles.length > 0, 'Should have files');
    assert(storeFiles[0].fileSize > 0, 'Compressed file should have size');

    console.log(`   压缩后文件大小: ${(storeFiles[0].fileSize / 1024).toFixed(2)} KB`);

    store.destroy();
  });

  // === 增量备份测试 ===

  console.log('\n## 增量备份测试\n');

  await test('可以创建增量备份', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      backupDir: testBackupDir,
      enablePersistence: true,
      enableIncrementalBackup: true,
      flushBatchSize: 5,
    });

    // 追加5个事件
    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 等待刷盘和备份完成
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 检查备份文件
    const backupFiles = fs.existsSync(testBackupDir)
      ? fs.readdirSync(testBackupDir)
      : [];
    const parquetBackups = backupFiles.filter((f) => f.startsWith('backup_'));

    assert(parquetBackups.length > 0, 'Should have backup files');

    store.destroy();
  });

  await test('可以清理旧备份', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      backupDir: testBackupDir,
      enablePersistence: true,
      enableIncrementalBackup: true,
      flushBatchSize: 2,
      maxBackups: 3,
    });

    // 创建5个批次的事件（会触发5次备份）
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 2; i++) {
        store.append({
          type: 'market.bar',
          timestamp: Date.now() + batch * 100 + i,
          payload: { batch, index: i },
        });
      }
      // 等待刷盘完成
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // 等待清理完成
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 检查备份文件数量
    const backupFiles = fs.existsSync(testBackupDir)
      ? fs.readdirSync(testBackupDir)
      : [];
    const parquetBackups = backupFiles.filter((f) => f.startsWith('backup_'));

    // 应该只保留3个最新的备份
    assert(
      parquetBackups.length <= 3,
      `Should have at most 3 backups, got ${parquetBackups.length}`
    );

    store.destroy();
  });

  // === 检查点测试 ===

  console.log('\n## 检查点测试\n');

  await test('可以创建和恢复检查点', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: true,
    });

    for (let i = 0; i < 5; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    const meta = store.checkpoint('cp1');
    assert(meta.checkpointId === 'cp1', 'Checkpoint ID should match');
    assert(meta.eventId === 4, 'Last event ID should be 4');

    // 等待持久化
    await new Promise((resolve) => setTimeout(resolve, 100));

    const snapshot = store.restore('cp1');
    assert(snapshot.checkpointId === 'cp1', 'Restored checkpoint should match');
    assert(snapshot.eventCount === 5, 'Event count should be 5');

    store.destroy();
  });

  // === 统计测试 ===

  console.log('\n## 统计测试\n');

  await test('可以获取存储统计', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: true,
      flushBatchSize: 10,
    });

    for (let i = 0; i < 15; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i },
      });
    }

    // 等待刷盘
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = store.getStats();
    assert(stats.totalEvents === 15, 'Total events should be 15');
    assert(stats.filesCount > 0, 'Should have files');
    assert(stats.totalFileSize > 0, 'Total file size should be > 0');
    assert(stats.memoryBufferSize === 15, 'Memory buffer should have 15 events');

    console.log(`   统计信息:`);
    console.log(`     总事件数: ${stats.totalEvents}`);
    console.log(`     文件数: ${stats.filesCount}`);
    console.log(`     总文件大小: ${(stats.totalFileSize / 1024).toFixed(2)} KB`);
    console.log(`     内存缓冲: ${stats.memoryBufferSize} 事件`);
    console.log(`     待刷盘: ${stats.pendingFlushSize} 事件`);

    store.destroy();
  });

  // === 性能测试 ===

  console.log('\n## 性能测试\n');

  await test('性能测试：写入10000个事件', async () => {
    const store = new EnhancedEventStore({
      storageDir: testDataDir,
      enablePersistence: true,
      flushBatchSize: 1000,
      enableCompression: true,
      enableIncrementalBackup: false, // 禁用备份以提高速度
    });

    const startTime = Date.now();

    for (let i = 0; i < 10000; i++) {
      store.append({
        type: 'market.bar',
        timestamp: Date.now() + i,
        payload: { index: i, price: 50000 + Math.random() * 1000 },
      });
    }

    // 等待所有刷盘完成
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = (10000 / duration) * 1000;

    const stats = store.getStats();

    console.log(`   性能指标:`);
    console.log(`     写入事件数: 10000`);
    console.log(`     耗时: ${duration}ms`);
    console.log(`     吞吐量: ${throughput.toFixed(2)} events/sec`);
    console.log(`     文件数: ${stats.filesCount}`);
    console.log(`     总文件大小: ${(stats.totalFileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     平均文件大小: ${(stats.totalFileSize / stats.filesCount / 1024).toFixed(2)} KB`);

    assert(throughput > 1000, `Throughput should be > 1000 events/sec, got ${throughput.toFixed(2)}`);

    store.destroy();
  });

  // === 清理 ===
  cleanupTestDirs();

  // === 测试总结 ===
  console.log('\n=== 测试总结 ===\n');
  console.log(`总测试数: ${testCount}`);
  console.log(`通过: ${passCount}`);
  console.log(`失败: ${failCount}`);
  console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

