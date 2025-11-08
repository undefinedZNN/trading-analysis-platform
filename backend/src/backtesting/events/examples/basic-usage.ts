/**
 * EventBus 基本使用示例
 * 
 * 演示：
 * 1. 创建事件总线
 * 2. 订阅事件
 * 3. 发布事件
 * 4. 状态控制
 * 5. 检查点
 * 6. 度量统计
 */

import { SimpleEventBus, SimpleEventStore } from '../simple-bus';
import { take } from 'rxjs';

console.log('=== EventBus 基本使用示例 ===\n');

// 1. 创建存储和总线
console.log('1. 创建EventStore和EventBus...');
const store = new SimpleEventStore();
const bus = new SimpleEventBus(store, {
  bufferSize: 1000,
  backpressureThreshold: 0.8,
});

console.log(`   初始状态: ${bus.getStatus()}`);
console.log('');

// 2. 订阅事件
console.log('2. 设置事件订阅...');

// 订阅市场数据
bus.subscribe('market.bar').subscribe({
  next: (event) => {
    console.log(`   [market.bar] ${event.payload.symbol}: $${event.payload.close}`);
  },
});

// 订阅策略信号
bus.subscribe('strategy.intent').subscribe({
  next: (event) => {
    console.log(`   [strategy.intent] ${event.payload.action} ${event.payload.symbol}`);
  },
});

// 订阅订单执行
bus.subscribe('execution.order').subscribe({
  next: (event) => {
    console.log(`   [execution.order] ${event.payload.action} at $${event.payload.price}`);
  },
});

// 订阅状态变化
bus.state$.subscribe({
  next: (state) => {
    if (state.status === 'running' && state.eventCount % 5 === 0 && state.eventCount > 0) {
      console.log(`   📊 状态: ${state.status}, 事件数: ${state.eventCount}`);
    }
  },
});

console.log('');

// 3. 启动总线
console.log('3. 启动事件总线...');
bus.start();
console.log(`   状态: ${bus.getStatus()}`);
console.log('');

// 4. 发布事件
console.log('4. 发布事件...');

// 发布市场数据
setTimeout(() => {
  console.log('   发布市场数据 #1');
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', close: '49000' },
  });
}, 100);

setTimeout(() => {
  console.log('   发布市场数据 #2');
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', close: '50500' },
  });

  // 触发策略信号
  console.log('   触发策略信号');
  bus.publish({
    type: 'strategy.intent',
    timestamp: Date.now(),
    payload: { action: 'BUY', symbol: 'BTC/USDT' },
  });
}, 200);

setTimeout(() => {
  console.log('   发布市场数据 #3');
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', close: '51000' },
  });

  // 触发订单执行
  console.log('   触发订单执行');
  bus.publish({
    type: 'execution.order',
    timestamp: Date.now(),
    payload: { action: 'BUY', symbol: 'BTC/USDT', price: '51000' },
  });
}, 300);

// 5. 创建检查点
setTimeout(() => {
  console.log('\n5. 创建检查点...');
  bus.checkpoint('cp1');
  console.log('   检查点 "cp1" 已创建');

  const checkpoints = store.listCheckpoints();
  console.log(`   当前检查点数: ${checkpoints.length}`);
}, 400);

setTimeout(() => {
  console.log('   继续发布更多事件...');
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'ETH/USDT', close: '3000' },
  });
}, 500);

// 6. 暂停和恢复
setTimeout(() => {
  console.log('\n6. 测试状态控制...');
  console.log('   暂停总线...');
  bus.pause();
  console.log(`   状态: ${bus.getStatus()}`);

  // 在暂停状态下发布事件（不会被处理）
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', close: '52000' },
  });
  console.log('   （在暂停状态下发布的事件不会被处理）');
}, 600);

setTimeout(() => {
  console.log('   恢复总线...');
  bus.resume();
  console.log(`   状态: ${bus.getStatus()}`);

  // 恢复后发布事件
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', close: '52000' },
  });
}, 700);

// 7. 度量统计
setTimeout(() => {
  console.log('\n7. 度量统计...');
  const metrics = bus.getMetrics();

  console.log(`   总事件数: ${metrics.totalEvents}`);
  console.log(`   错误数: ${metrics.errorCount}`);
  console.log(`   吞吐量: ${metrics.throughput.toFixed(2)} events/sec`);
  console.log(`   运行时间: ${(metrics.uptime / 1000).toFixed(2)}s`);
  console.log(`   缓冲区使用: ${(metrics.bufferUsage * 100).toFixed(2)}%`);
  console.log(`   背压: ${metrics.backpressure ? '是' : '否'}`);
}, 800);

// 8. 查询事件
setTimeout(() => {
  console.log('\n8. 查询事件...');
  const allEvents = store.getAll();
  console.log(`   总事件数: ${allEvents.length}`);
  console.log(`   前3个事件:`);

  allEvents.slice(0, 3).forEach((event) => {
    console.log(`     - [${event.eventId}] ${event.type}`);
  });
}, 900);

// 9. 停止和清理
setTimeout(() => {
  console.log('\n9. 停止和清理...');
  bus.stop();
  console.log(`   状态: ${bus.getStatus()}`);

  // 最终统计
  console.log('\n=== 最终统计 ===');
  const finalMetrics = bus.getMetrics();
  console.log(`总事件数: ${finalMetrics.totalEvents}`);
  console.log(`处理时长: ${(finalMetrics.uptime / 1000).toFixed(2)}s`);
  console.log(`平均吞吐量: ${finalMetrics.throughput.toFixed(2)} events/sec`);

  // 检查点信息
  const checkpoints = store.listCheckpoints();
  console.log(`\n检查点数: ${checkpoints.length}`);
  checkpoints.forEach((cp) => {
    console.log(`  - ${cp.checkpointId}: event ${cp.eventId}`);
  });

  console.log('\n清理资源...');
  bus.destroy();
  store.destroy();

  console.log('\n✅ 示例完成');
  console.log('');
}, 1000);

