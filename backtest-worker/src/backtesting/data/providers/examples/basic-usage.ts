/**
 * DataProvider 基础使用示例
 */

import { createParquetDuckDBProvider } from '../index';

/**
 * 示例 1: 基础数据提取
 */
async function example1_BasicFetch() {
  console.log('\n=== 示例 1: 基础数据提取 ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
    defaultBatchSize: 1000,
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T00:10:00.000Z',
      baseTimeframe: '1m',
    });

    let count = 0;
    await new Promise((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar) => {
          count++;
          if (count <= 5) {
            console.log(`[${bar.timestamp}] ${bar.symbol}`);
            console.log(`  OHLC: ${bar.open} / ${bar.high} / ${bar.low} / ${bar.close}`);
            console.log(`  Volume: ${bar.volume}`);
          }
        },
        error: reject,
        complete: () => {
          console.log(`\n总共提取 ${count} 条记录`);
          resolve(null);
        },
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 2: 缺口填充 - 前向填充
 */
async function example2_ForwardFill() {
  console.log('\n=== 示例 2: 缺口填充（前向填充） ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T00:10:00.000Z',
      baseTimeframe: '1m',
      gapPolicy: 'fill',
      fillMethod: 'forwardFill',
    });

    let syntheticCount = 0;
    let originalCount = 0;

    await new Promise((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar) => {
          if (bar.context?.qualityFlag === 'synthetic') {
            syntheticCount++;
            console.log(`[合成] ${bar.timestamp} - 价格: ${bar.close}`);
          } else {
            originalCount++;
          }
        },
        error: reject,
        complete: () => {
          console.log(`\n原始数据: ${originalCount} 条`);
          console.log(`合成数据: ${syntheticCount} 条`);
          resolve(null);
        },
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 3: 缺口填充 - 线性插值
 */
async function example3_LinearInterpolation() {
  console.log('\n=== 示例 3: 缺口填充（线性插值） ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T00:10:00.000Z',
      baseTimeframe: '1m',
      gapPolicy: 'fill',
      fillMethod: 'linear',
    });

    await new Promise((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar) => {
          if (bar.context?.qualityFlag === 'interpolated') {
            console.log(`[插值] ${bar.timestamp} - 价格: ${bar.close}`);
            console.log(`  插值信息: ${JSON.stringify(bar.context.interpolation, null, 2)}`);
          }
        },
        error: reject,
        complete: () => {
          console.log('\n插值完成');
          resolve(null);
        },
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 4: 大数据集分片加载
 */
async function example4_BatchLoading() {
  console.log('\n=== 示例 4: 大数据集分片加载 ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
    defaultBatchSize: 100,
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T06:00:00.000Z', // 6小时的1秒数据
      baseTimeframe: '1s',
      batchSize: 1000,
      maxConcurrent: 2,
    });

    let count = 0;
    const startTime = Date.now();

    await new Promise((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar) => {
          count++;
          if (count % 5000 === 0) {
            console.log(`已处理 ${count} 条记录...`);
          }
        },
        error: reject,
        complete: () => {
          const elapsed = Date.now() - startTime;
          console.log(`\n总共处理 ${count} 条记录`);
          console.log(`耗时: ${elapsed}ms`);
          console.log(`吞吐量: ${Math.round(count / (elapsed / 1000))} 条/秒`);
          resolve(null);
        },
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 5: 批次重叠（用于滚动指标）
 */
async function example5_OverlappingBatches() {
  console.log('\n=== 示例 5: 批次重叠 ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T01:00:00.000Z',
      baseTimeframe: '1m',
      batchSize: 20,
      overlapSize: 5, // 每批重叠5条，用于计算MA等指标
    });

    let count = 0;
    await new Promise((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar) => {
          count++;
          console.log(`[${count}] ${bar.timestamp} - ${bar.close}`);
        },
        error: reject,
        complete: () => {
          console.log(`\n总共处理 ${count} 条记录（包含重叠）`);
          resolve(null);
        },
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 6: 提取特定字段
 */
async function example6_SpecificFields() {
  console.log('\n=== 示例 6: 提取特定字段 ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
  });

  try {
    const barEvents$ = provider.fetch({
      symbol: 'BTC-USDT',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T00:10:00.000Z',
      baseTimeframe: '1m',
      fields: ['close', 'volume'], // 只提取收盘价和成交量
    });

    await new Promise<void>((resolve, reject) => {
      barEvents$.subscribe({
        next: (bar: any) => {
          console.log(`${bar.timestamp}: Close=${bar.close}, Volume=${bar.volume}`);
        },
        error: reject,
        complete: () => resolve(),
      });
    });
  } finally {
    await provider.close?.();
  }
}

/**
 * 示例 7: 获取元数据
 */
async function example7_Metadata() {
  console.log('\n=== 示例 7: 获取数据集元数据 ===\n');

  const provider = createParquetDuckDBProvider({
    storageBasePath: 'storage/datasets',
  });

  try {
    const metadata = await provider.getMetadata?.('BTC-USDT');
    
    if (metadata) {
      console.log('数据集元数据:');
      console.log(`  标的: ${metadata.symbol}`);
      console.log(`  时间范围: ${metadata.startTime} ~ ${metadata.endTime}`);
      console.log(`  总记录数: ${metadata.totalRecords}`);
      console.log(`  可用时间框架: ${metadata.availableTimeframes.join(', ')}`);
      
      if (metadata.quality) {
        console.log(`  完整性: ${metadata.quality.completeness}%`);
        console.log(`  已知缺口数: ${metadata.quality.knownGaps.length}`);
      }
    }
  } catch (error) {
    console.error('获取元数据失败:', error);
  } finally {
    await provider.close?.();
  }
}

/**
 * 主函数：运行所有示例
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     DataProvider 使用示例                        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    await example1_BasicFetch();
    // await example2_ForwardFill();
    // await example3_LinearInterpolation();
    // await example4_BatchLoading();
    // await example5_OverlappingBatches();
    // await example6_SpecificFields();
    // await example7_Metadata();

    console.log('\n✅ 所有示例运行完成！\n');
  } catch (error) {
    console.error('\n❌ 示例运行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_BasicFetch,
  example2_ForwardFill,
  example3_LinearInterpolation,
  example4_BatchLoading,
  example5_OverlappingBatches,
  example6_SpecificFields,
  example7_Metadata,
};
