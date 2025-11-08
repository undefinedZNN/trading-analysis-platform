/**
 * AutoSubscribeEventBus 使用示例
 * 
 * 展示如何使用 AutoSubscribeEventBus 简化事件总线的使用
 */

import {
  AutoSubscribeEventBus,
  SimpleEventStore,
  createAutoSubscribeEventBus,
} from '../';

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║          AutoSubscribeEventBus 使用示例                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// =====================================================================
// 示例 1: 基本使用（默认启用自动订阅）
// =====================================================================

console.log('## 示例 1: 基本使用\n');

{
  const store = new SimpleEventStore();
  const bus = new AutoSubscribeEventBus(store);  // 默认 autoSubscribe: true
  
  console.log(`自动订阅已启用: ${bus.isAutoSubscribeEnabled()}`);
  console.log(`保活订阅活跃: ${bus.isKeepAliveActive()}`);
  
  bus.start();
  
  // ✅ 无需手动订阅，直接发布事件
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', price: 50000 },
  });
  
  setTimeout(() => {
    console.log(`存储的事件数: ${store.getEventCount()}`);
    console.log(`总线指标: ${bus.getMetrics().totalEvents} events\n`);
    
    bus.destroy();
    store.destroy();
  }, 100);
}

// =====================================================================
// 示例 2: 显式配置
// =====================================================================

setTimeout(() => {
  console.log('## 示例 2: 显式配置\n');
  
  const store = new SimpleEventStore();
  const bus = new AutoSubscribeEventBus(store, {
    autoSubscribe: true,      // 启用自动订阅
    bufferSize: 2000,         // 缓冲区大小
    backpressureThreshold: 0.9, // 背压阈值
  });
  
  bus.start();
  
  // 发布多个事件
  for (let i = 0; i < 10; i++) {
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now() + i * 1000,
      payload: {
        symbol: 'ETH/USDT',
        price: 3000 + i * 10,
      },
    });
  }
  
  setTimeout(() => {
    const metrics = bus.getMetrics();
    console.log(`处理事件数: ${metrics.totalEvents}`);
    console.log(`吞吐量: ${metrics.throughput.toFixed(0)} events/sec`);
    console.log(`运行时间: ${metrics.uptime}ms\n`);
    
    bus.destroy();
    store.destroy();
  }, 150);
}, 200);

// =====================================================================
// 示例 3: 与业务订阅者结合
// =====================================================================

setTimeout(() => {
  console.log('## 示例 3: 与业务订阅者结合\n');
  
  const store = new SimpleEventStore();
  const bus = new AutoSubscribeEventBus(store);
  
  // 添加业务订阅者（处理特定逻辑）
  let processedCount = 0;
  const subscription = bus.subscribe('market.bar').subscribe((event) => {
    processedCount++;
    console.log(`处理事件 #${processedCount}: ${event.payload.symbol} @ $${event.payload.price}`);
  });
  
  bus.start();
  
  // 发布事件
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: { symbol: 'BTC/USDT', price: 51000 },
  });
  
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now() + 1000,
    payload: { symbol: 'ETH/USDT', price: 3100 },
  });
  
  setTimeout(() => {
    console.log(`\n业务订阅者处理了 ${processedCount} 个事件`);
    console.log(`EventStore 存储了 ${store.getEventCount()} 个事件\n`);
    
    subscription.unsubscribe();
    bus.destroy();
    store.destroy();
  }, 150);
}, 450);

// =====================================================================
// 示例 4: 使用工厂函数
// =====================================================================

setTimeout(() => {
  console.log('## 示例 4: 使用工厂函数\n');
  
  const store = new SimpleEventStore();
  
  // ✅ 使用工厂函数创建
  const bus = createAutoSubscribeEventBus(store, {
    autoSubscribe: true,
  });
  
  console.log(`Bus类型: ${bus.constructor.name}`);
  console.log(`自动订阅: ${bus.isAutoSubscribeEnabled()}`);
  
  bus.start();
  
  bus.publish({
    type: 'test.event',
    timestamp: Date.now(),
    payload: { message: 'Created with factory function' },
  });
  
  setTimeout(() => {
    console.log(`事件已存储: ${store.getEventCount()}\n`);
    bus.destroy();
    store.destroy();
  }, 100);
}, 700);

// =====================================================================
// 示例 5: 完整的回测场景
// =====================================================================

setTimeout(() => {
  console.log('## 示例 5: 完整回测场景\n');
  
  const store = new SimpleEventStore();
  const bus = new AutoSubscribeEventBus(store);
  
  // 策略订阅者
  let signals = 0;
  bus.subscribe('market.bar').subscribe((event) => {
    const price = event.payload.price;
    
    // 简单策略：价格突破 50500 时发出信号
    if (price > 50500) {
      bus.publish({
        type: 'strategy.signal',
        timestamp: Date.now(),
        payload: {
          action: 'BUY',
          price,
          reason: 'Price breakout',
        },
      });
      signals++;
    }
  });
  
  // 风控订阅者
  bus.subscribe('strategy.signal').subscribe((event) => {
    console.log(`📊 策略信号: ${event.payload.action} @ $${event.payload.price}`);
    console.log(`   原因: ${event.payload.reason}`);
  });
  
  bus.start();
  
  // 模拟市场数据
  const prices = [50000, 50300, 50600, 50800, 50500, 50200];
  
  prices.forEach((price, index) => {
    setTimeout(() => {
      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: {
          symbol: 'BTC/USDT',
          price,
        },
      });
    }, index * 20);
  });
  
  setTimeout(() => {
    const metrics = bus.getMetrics();
    console.log(`\n回测完成:`);
    console.log(`  市场事件: ${prices.length}`);
    console.log(`  策略信号: ${signals}`);
    console.log(`  总事件数: ${metrics.totalEvents}`);
    console.log(`  存储事件: ${store.getEventCount()}`);
    console.log();
    
    bus.destroy();
    store.destroy();
  }, 200);
}, 900);

// =====================================================================
// 示例 6: 禁用自动订阅（传统模式）
// =====================================================================

setTimeout(() => {
  console.log('## 示例 6: 禁用自动订阅\n');
  
  const store = new SimpleEventStore();
  const bus = new AutoSubscribeEventBus(store, {
    autoSubscribe: false,  // 禁用自动订阅
  });
  
  console.log(`自动订阅已启用: ${bus.isAutoSubscribeEnabled()}`);
  console.log(`保活订阅活跃: ${bus.isKeepAliveActive()}`);
  
  bus.start();
  
  // ❌ 没有订阅者，事件不会被处理
  bus.publish({
    type: 'market.bar',
    timestamp: Date.now(),
    payload: {},
  });
  
  setTimeout(() => {
    console.log(`存储事件数（无订阅者）: ${store.getEventCount()}`);
    
    // ✅ 现在添加订阅者
    const sub = bus.event$.subscribe();
    
    bus.publish({
      type: 'market.bar',
      timestamp: Date.now(),
      payload: {},
    });
    
    setTimeout(() => {
      console.log(`存储事件数（有订阅者）: ${store.getEventCount()}\n`);
      
      sub.unsubscribe();
      bus.destroy();
      store.destroy();
    }, 100);
  }, 100);
}, 1200);

// =====================================================================
// 示例 7: 集成测试用例
// =====================================================================

setTimeout(() => {
  console.log('## 示例 7: 在测试中使用\n');
  
  // ✅ 简化的测试代码
  function testEventProcessing() {
    const store = new SimpleEventStore();
    const bus = new AutoSubscribeEventBus(store);  // 自动订阅
    
    bus.start();
    
    // 直接发布事件，无需手动订阅
    bus.publish({
      type: 'test.event',
      timestamp: Date.now(),
      payload: { test: true },
    });
    
    setTimeout(() => {
      const passed = store.getEventCount() === 1;
      console.log(`测试结果: ${passed ? '✅ 通过' : '❌ 失败'}`);
      console.log(`预期: 1 个事件`);
      console.log(`实际: ${store.getEventCount()} 个事件\n`);
      
      bus.destroy();
      store.destroy();
      
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                   示例演示完成                                 ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    }, 100);
  }
  
  testEventProcessing();
}, 1500);

