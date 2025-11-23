# Frontend API Client 使用指南

**版本**: 1.0.0  
**最后更新**: 2025-11-22

---

## 📦 安装和配置

### 1. 导入API Client

```typescript
import { apiClient, createApiClient, TradingPlatformApiClient } from '@/api/client';
```

### 2. 使用默认客户端

```typescript
// 使用默认配置的客户端（推荐用于开发环境）
const tasks = await apiClient.listTasks();
```

### 3. 创建自定义客户端

```typescript
// 用于生产环境或特定配置
const customClient = createApiClient({
  baseUrl: 'https://api.trading-platform.com/api/v1',
  timeout: 60000, // 60秒超时
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'X-Custom-Header': 'value',
  },
});
```

---

## 🔧 Worker管理 API

### 获取所有Worker列表

```typescript
const workers = await apiClient.listWorkers();

console.log(`总共有 ${workers.length} 个Worker`);
workers.forEach(worker => {
  console.log(`${worker.workerId}: ${worker.status} - 负载 ${worker.currentLoad}/${worker.capabilities.maxConcurrentTasks}`);
});
```

### 获取Worker详情

```typescript
const worker = await apiClient.getWorker('worker-1');

console.log('Worker信息:', {
  ID: worker.workerId,
  状态: worker.status,
  当前负载: worker.currentLoad,
  最大并发: worker.capabilities.maxConcurrentTasks,
  注册时间: new Date(worker.registeredAt).toLocaleString(),
  最后心跳: new Date(worker.lastHeartbeat).toLocaleString(),
});
```

### Worker健康检查

```typescript
const health = await apiClient.getWorkerHealth('worker-1');

if (health.healthy) {
  console.log('✅ Worker健康');
} else {
  console.warn('⚠️ Worker不健康:', {
    状态: health.status,
    心跳延迟: `${health.heartbeatAge}ms`,
    运行时间: `${Math.floor(health.uptime / 1000 / 60)}分钟`,
  });
}
```

### Worker性能指标

```typescript
const metrics = await apiClient.getWorkerMetrics('worker-1');

console.log('Worker性能:', {
  负载百分比: `${metrics.loadPercentage.toFixed(2)}%`,
  运行时间: `${Math.floor(metrics.uptime / 1000 / 60 / 60)}小时`,
  自定义指标: metrics.customMetrics,
});
```

### 启动/停止Worker

```typescript
// 启动Worker
const startResult = await apiClient.startWorker('worker-1');
console.log(startResult.message); // "Worker启动命令已发送"

// 停止Worker
const stopResult = await apiClient.stopWorker('worker-1');
console.log(stopResult.message); // "Worker停止命令已发送"
```

---

## 📋 任务管理 API

### 创建回测任务

```typescript
const newTask = await apiClient.createTask({
  taskName: '双均线策略回测-2024全年',
  taskDescription: '测试双均线策略在2024年BTC/USDT上的表现',
  strategyId: '550e8400-e29b-41d4-a716-446655440000',
  scriptVersionId: '660e8400-e29b-41d4-a716-446655440001',
  datasetId: 1,
  strategyParams: {
    fastPeriod: 10,
    slowPeriod: 30,
    positionSize: 0.5,
  },
  executionConfig: {
    initialCapital: 10000,
    leverage: 1,
    slippage: 0,
    fees: {
      makerFee: 0.0002,
      takerFee: 0.0005,
    },
  },
  dataConfig: {
    timeRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
    },
    timeframe: '1h',
  },
  checkpointEnabled: true,
  checkpointIntervalBars: 1000,
});

console.log('任务创建成功:', newTask.taskId);
```

### 查询任务列表

```typescript
// 基础查询
const { results, total, page, pageSize } = await apiClient.listTasks({
  page: 1,
  pageSize: 20,
});

console.log(`共 ${total} 个任务，当前第 ${page} 页`);

// 高级筛选
const filteredTasks = await apiClient.listTasks({
  keyword: '双均线',
  status: 'running',
  strategyId: '550e8400-e29b-41d4-a716-446655440000',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 10,
});
```

### 获取任务详情

```typescript
const task = await apiClient.getTask(taskId);

console.log('任务详情:', {
  名称: task.taskName,
  状态: task.status,
  进度: `${task.progress}%`,
  Worker: task.assignedWorkerId || '未分配',
  创建时间: task.createdAt,
  开始时间: task.startedAt,
  完成时间: task.completedAt,
});
```

### 任务控制操作

```typescript
// 取消任务
await apiClient.cancelTask(taskId);

// 暂停任务
await apiClient.pauseTask(taskId);

// 恢复任务
await apiClient.resumeTask(taskId);

// 重试失败的任务
await apiClient.retryTask(taskId);

// 复制任务配置
const config = await apiClient.copyTaskConfig(taskId);
const newTask = await apiClient.createTask({
  ...config,
  taskName: `${config.taskName} (副本)`,
});
```

### 获取任务统计

```typescript
const stats = await apiClient.getTaskStatistics();

console.log('任务统计:', {
  总任务数: stats.total,
  待执行: stats.pending,
  运行中: stats.running,
  已完成: stats.completed,
  失败: stats.failed,
  已取消: stats.cancelled,
  成功率: `${(stats.successRate * 100).toFixed(2)}%`,
  平均执行时间: stats.averageExecutionTime 
    ? `${Math.floor(stats.averageExecutionTime / 1000 / 60)}分钟`
    : '未知',
});
```

---

## 📊 结果查询 API

### 获取任务的所有结果

```typescript
const { results, total } = await apiClient.getTaskResults(taskId, {
  page: 1,
  limit: 10,
  orderBy: 'totalReturnPct',
  order: 'DESC',
});

console.log(`任务有 ${total} 个结果`);
results.forEach(result => {
  console.log(`${result.resultName}: 收益率 ${result.totalReturnPct.toFixed(2)}%`);
});
```

### 获取主结果

```typescript
const primaryResult = await apiClient.getPrimaryResult(taskId);

console.log('主结果:', {
  结果名称: primaryResult.resultName,
  初始资金: primaryResult.initialCash,
  最终权益: primaryResult.finalValue,
  总盈亏: primaryResult.totalPnl,
  收益率: `${primaryResult.totalReturnPct.toFixed(2)}%`,
  夏普比率: primaryResult.sharpeRatio?.toFixed(2),
  最大回撤: `${primaryResult.maxDrawdownPct?.toFixed(2)}%`,
  胜率: `${(primaryResult.winRate * 100).toFixed(2)}%`,
  总交易次数: primaryResult.totalTrades,
});
```

### 创建过滤结果

```typescript
const filteredResult = await apiClient.createFilteredResult(taskId, {
  resultName: 'RSI>70过滤',
  filterConditions: {
    factors: {
      rsi: { min: 70 },
    },
    timeRange: {
      start: '2024-06-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
    },
    tradeType: {
      buy: true,
      sell: false, // 只看买入交易
    },
  },
});

console.log('过滤结果:', {
  原始交易数: filteredResult.tradesCountTotal,
  过滤后交易数: filteredResult.tradesCountFiltered,
  收益率: `${filteredResult.totalReturnPct.toFixed(2)}%`,
});
```

### 获取结果统计摘要

```typescript
const summary = await apiClient.getResultsSummary(taskId);

console.log('结果摘要:', {
  结果总数: summary.total,
  是否有主结果: summary.hasPrimary,
  最佳收益: summary.topByReturn 
    ? `${summary.topByReturn.resultName}: ${summary.topByReturn.totalReturnPct.toFixed(2)}%`
    : '无',
  最佳夏普: summary.topBySharpe
    ? `${summary.topBySharpe.resultName}: ${summary.topBySharpe.sharpeRatio?.toFixed(2)}`
    : '无',
});
```

### 对比多个结果

```typescript
const comparison = await apiClient.compareResults([
  'result-id-1',
  'result-id-2',
  'result-id-3',
]);

console.log('对比结果:');
comparison.results.forEach(result => {
  const isBestReturn = result.resultId === comparison.comparison.bestReturn;
  const isBestSharpe = result.resultId === comparison.comparison.bestSharpe;
  const isLowestDrawdown = result.resultId === comparison.comparison.lowestDrawdown;

  console.log(`${result.resultName}:`, {
    收益率: `${result.totalReturnPct.toFixed(2)}%` + (isBestReturn ? ' 🏆' : ''),
    夏普比率: `${result.sharpeRatio?.toFixed(2)}` + (isBestSharpe ? ' 🏆' : ''),
    最大回撤: `${result.maxDrawdownPct?.toFixed(2)}%` + (isLowestDrawdown ? ' 🏆' : ''),
  });
});
```

### 获取交易明细

```typescript
const { trades, total, page, pageSize } = await apiClient.getTradesData(taskId, {
  page: 1,
  limit: 50,
  filterConditions: JSON.stringify({
    direction: 'long',
    minPnl: 100,
  }),
});

console.log(`共 ${total} 笔交易`);
trades.forEach(trade => {
  console.log(`${trade.direction} ${trade.size}@ ${trade.entry_price} -> ${trade.exit_price}, PnL: ${trade.pnl.toFixed(2)}`);
});
```

### 获取权益曲线

```typescript
const equityCurve = await apiClient.getEquityData(taskId);

console.log(`权益曲线有 ${equityCurve.length} 个数据点`);

// 用于图表展示
const chartData = equityCurve.map(point => ({
  x: new Date(point.datetime).getTime(),
  y: point.value,
}));
```

---

## 🎨 实际应用示例

### 示例1: Worker监控仪表盘

```typescript
async function loadWorkerDashboard() {
  try {
    const workers = await apiClient.listWorkers();
    
    const healthChecks = await Promise.all(
      workers.map(worker => apiClient.getWorkerHealth(worker.workerId))
    );
    
    const dashboard = workers.map((worker, index) => ({
      ...worker,
      health: healthChecks[index],
    }));
    
    // 统计
    const stats = {
      total: dashboard.length,
      healthy: dashboard.filter(w => w.health.healthy).length,
      idle: dashboard.filter(w => w.status === 'idle').length,
      busy: dashboard.filter(w => w.status === 'busy').length,
      overloaded: dashboard.filter(w => w.status === 'overloaded').length,
      down: dashboard.filter(w => w.status === 'down').length,
    };
    
    return { dashboard, stats };
  } catch (error) {
    console.error('加载Worker仪表盘失败:', error);
    throw error;
  }
}
```

### 示例2: 任务进度追踪

```typescript
async function trackTaskProgress(taskId: string) {
  const interval = setInterval(async () => {
    try {
      const task = await apiClient.getTask(taskId);
      
      console.log(`任务 ${task.taskName}:`);
      console.log(`  状态: ${task.status}`);
      console.log(`  进度: ${task.progress}%`);
      
      // 任务完成，停止追踪
      if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        clearInterval(interval);
        
        if (task.status === 'completed') {
          console.log('✅ 任务完成！获取结果...');
          const result = await apiClient.getPrimaryResult(taskId);
          console.log(`收益率: ${result.totalReturnPct.toFixed(2)}%`);
        } else {
          console.log('❌ 任务失败:', task.errorMessage);
        }
      }
    } catch (error) {
      console.error('追踪任务失败:', error);
      clearInterval(interval);
    }
  }, 5000); // 每5秒查询一次
}
```

### 示例3: 批量任务管理

```typescript
async function batchTaskManagement() {
  // 获取所有运行中的任务
  const { results: runningTasks } = await apiClient.listTasks({
    status: 'running',
    pageSize: 100,
  });
  
  console.log(`发现 ${runningTasks.length} 个运行中的任务`);
  
  // 暂停所有运行中的任务
  const pauseResults = await Promise.allSettled(
    runningTasks.map(task => apiClient.pauseTask(task.taskId))
  );
  
  const succeeded = pauseResults.filter(r => r.status === 'fulfilled').length;
  const failed = pauseResults.filter(r => r.status === 'rejected').length;
  
  console.log(`暂停完成: ${succeeded} 成功, ${failed} 失败`);
  
  // 等待一段时间后恢复
  await new Promise(resolve => setTimeout(resolve, 60000)); // 1分钟
  
  const resumeResults = await Promise.allSettled(
    runningTasks.map(task => apiClient.resumeTask(task.taskId))
  );
  
  console.log(`恢复完成: ${resumeResults.filter(r => r.status === 'fulfilled').length} 成功`);
}
```

### 示例4: 结果分析和报表

```typescript
async function generateAnalysisReport(taskId: string) {
  try {
    // 获取主结果
    const primaryResult = await apiClient.getPrimaryResult(taskId);
    
    // 获取所有结果用于对比
    const { results: allResults } = await apiClient.getTaskResults(taskId, {
      limit: 100,
    });
    
    // 获取权益曲线
    const equityCurve = await apiClient.getEquityData(taskId);
    
    // 计算峰值和谷值
    const values = equityCurve.map(p => p.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    
    const report = {
      basicInfo: {
        任务ID: taskId,
        初始资金: primaryResult.initialCash,
        最终权益: primaryResult.finalValue,
        总盈亏: primaryResult.totalPnl,
        收益率: `${primaryResult.totalReturnPct.toFixed(2)}%`,
      },
      performance: {
        夏普比率: primaryResult.sharpeRatio?.toFixed(2),
        索提诺比率: primaryResult.sortinoRatio?.toFixed(2),
        最大回撤: `${primaryResult.maxDrawdownPct?.toFixed(2)}%`,
        年化收益率: `${primaryResult.annualizedReturnPct?.toFixed(2)}%`,
      },
      trading: {
        总交易次数: primaryResult.totalTrades,
        盈利次数: primaryResult.winningTrades,
        亏损次数: primaryResult.losingTrades,
        胜率: `${(primaryResult.winRate * 100).toFixed(2)}%`,
        盈亏比: primaryResult.profitFactor?.toFixed(2),
      },
      equityCurve: {
        数据点数: equityCurve.length,
        最高权益: maxValue,
        最低权益: minValue,
        波动范围: `${((maxValue - minValue) / primaryResult.initialCash * 100).toFixed(2)}%`,
      },
      variants: {
        结果变体数量: allResults.length,
        最佳收益: Math.max(...allResults.map(r => r.totalReturnPct)).toFixed(2) + '%',
        最差收益: Math.min(...allResults.map(r => r.totalReturnPct)).toFixed(2) + '%',
      },
    };
    
    return report;
  } catch (error) {
    console.error('生成分析报表失败:', error);
    throw error;
  }
}
```

---

## 🚨 错误处理

### 基础错误处理

```typescript
try {
  const task = await apiClient.getTask(taskId);
  // 处理任务
} catch (error) {
  if (error.message.includes('404')) {
    console.error('任务不存在');
  } else if (error.message.includes('401')) {
    console.error('未授权，请重新登录');
  } else {
    console.error('请求失败:', error.message);
  }
}
```

### 全局错误拦截

```typescript
// 创建带全局错误处理的客户端
class ErrorHandlingClient extends TradingPlatformApiClient {
  private async request<T>(...args: any[]): Promise<T> {
    try {
      return await super.request<T>(...args);
    } catch (error) {
      // 全局错误处理
      if (error.message.includes('401')) {
        // 触发重新登录
        window.location.href = '/login';
      } else if (error.message.includes('500')) {
        // 显示服务器错误提示
        alert('服务器错误，请稍后重试');
      }
      throw error;
    }
  }
}
```

---

## 📝 TypeScript类型提示

所有API方法都有完整的TypeScript类型定义，可以获得IDE的智能提示：

```typescript
// 自动类型推断
const task = await apiClient.getTask(taskId);
// task 的类型自动推断为 BacktestTask

// 参数类型检查
await apiClient.createTask({
  taskName: '测试任务',
  // TypeScript会提示缺少必需字段
  // 会提示可选字段
});

// 返回类型检查
const result: BacktestResult = await apiClient.getPrimaryResult(taskId);
```

---

## 🔗 相关资源

- [完整API文档](./API_EXAMPLES.md)
- [Swagger文档](http://localhost:3000/api/docs)
- [类型定义](../frontend/src/api/client.ts)
- [示例代码](../frontend/src/examples/)

---

**最后更新**: 2025-11-22  
**维护者**: Development Team

