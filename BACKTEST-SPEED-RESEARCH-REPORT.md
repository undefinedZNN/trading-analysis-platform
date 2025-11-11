# 回测速度调研报告

**调研时间**: 2025-11-11 02:00  
**调研目标**: 确认回测框架是否支持"无延迟"K线推送  
**结论**: ✅ 支持,但需要修改

---

## 🔍 调研发现

### 1. 当前实现 - 基于定时器的回放

**文件**: `backend/src/backtesting/execution/services/data-feed.service.ts`

**核心代码** (第60-106行):
```typescript
replay(data: MarketBar[], speed: number = 1): Observable<MarketBar> {
  // 计算回放间隔 (假设1秒对应1个Bar)
  const intervalMs = 1000 / speed;  // ⚠️ 这里是问题所在

  // 创建定时器 - 使用RxJS的interval
  const replay$ = interval(intervalMs).pipe(
    takeWhile(() => {
      const state = this.replayState$.value;
      return (
        state === ReplayState.PLAYING &&
        this.currentIndex < this.historicalData.length
      );
    }),
    map(() => {
      const bar = this.historicalData[this.currentIndex];
      this.currentIndex++;
      this.dataSubject$.next(bar);
      return bar;
    }),
    share(),
  );

  return replay$;
}
```

### 2. 问题分析

#### ❌ **当前问题**:
```typescript
// speed = 1  → intervalMs = 1000ms → 每1秒推送1根K线
// speed = 10 → intervalMs = 100ms  → 每0.1秒推送1根K线

// 即使speed = 1000,也需要:
intervalMs = 1000 / 1000 = 1ms → 每1毫秒推送1根K线
```

**性能瓶颈**:
1. **定时器开销**: `interval(1ms)` 仍然有定时器调度开销
2. **不是真正的"无延迟"**: 即使1ms间隔,处理100万根K线也需要1000秒(16.7分钟)
3. **CPU空转**: 定时器在等待时CPU处于空闲状态

#### ✅ **理想状态**:
```typescript
// 同步推送,无延迟
for (const bar of historicalData) {
  await processBar(bar);  // 处理完立即推送下一根
}

// 或异步批量推送
historicalData.forEach(bar => {
  processBar(bar);  // 不等待,立即推送下一根
});
```

---

## 💡 解决方案

### 方案A: **添加"最快速度"模式** (推荐)

修改 `data-feed.service.ts`:

```typescript
replay(data: MarketBar[], speed: number = 1): Observable<MarketBar> {
  this.historicalData = data;
  this.speed = speed;
  this.currentIndex = 0;
  this.replayState$.next(ReplayState.PLAYING);

  // ✅ 新增: 如果speed为0或Infinity,使用同步推送
  if (speed === 0 || speed === Infinity) {
    return this.replaySynchronous(data);
  }

  // 原有的定时器逻辑
  const intervalMs = 1000 / speed;
  const replay$ = interval(intervalMs).pipe(
    // ... 原有逻辑
  );

  return replay$;
}

/**
 * 同步回放 - 最快速度
 */
private replaySynchronous(data: MarketBar[]): Observable<MarketBar> {
  return new Observable<MarketBar>((observer) => {
    // 使用setImmediate或nextTick批量推送
    const processNextBatch = (startIndex: number) => {
      const batchSize = 1000; // 每批处理1000根K线
      const endIndex = Math.min(startIndex + batchSize, data.length);

      for (let i = startIndex; i < endIndex; i++) {
        if (this.replayState$.value !== ReplayState.PLAYING) {
          observer.complete();
          return;
        }

        const bar = data[i];
        this.currentIndex = i + 1;
        this.dataSubject$.next(bar);
        observer.next(bar);
      }

      if (endIndex < data.length) {
        // 使用setImmediate避免阻塞事件循环
        setImmediate(() => processNextBatch(endIndex));
      } else {
        this.logger.log('Synchronous replay completed');
        this.replayState$.next(ReplayState.STOPPED);
        observer.complete();
      }
    };

    processNextBatch(0);
  }).pipe(share());
}
```

**优点**:
- ✅ 向后兼容 - 保留原有speed参数
- ✅ 最快速度 - speed=0或Infinity时同步推送
- ✅ 灵活性 - 用户可以选择慢速(调试)或快速(生产)

**使用方式**:
```typescript
// 前端表单
<Form.Item label="回放模式">
  <Radio.Group>
    <Radio value={0}>最快速度 (推荐)</Radio>
    <Radio value={1}>实时模拟 (1x)</Radio>
    <Radio value={0.5}>慢速调试 (0.5x)</Radio>
  </Radio.Group>
</Form.Item>

// 或者简化为开关
<Form.Item label="快速回测">
  <Switch 
    checked={fastMode} 
    onChange={(checked) => setSpeed(checked ? 0 : 1)}
  />
  {!fastMode && (
    <Slider min={0.1} max={10} value={speed} onChange={setSpeed} />
  )}
</Form.Item>
```

---

### 方案B: **移除speed参数,始终最快** (激进)

```typescript
replay(data: MarketBar[]): Observable<MarketBar> {
  return new Observable<MarketBar>((observer) => {
    for (const bar of data) {
      if (this.replayState$.value !== ReplayState.PLAYING) {
        break;
      }
      this.dataSubject$.next(bar);
      observer.next(bar);
    }
    observer.complete();
  }).pipe(share());
}
```

**优点**:
- ✅ 最简单 - 代码最少
- ✅ 最快速度 - 无任何延迟
- ✅ 符合回测本质 - 回测就是要快

**缺点**:
- ❌ 失去灵活性 - 无法慢速调试
- ❌ 可能阻塞 - 大量数据可能阻塞事件循环
- ❌ 难以暂停/恢复 - 同步执行难以中断

---

### 方案C: **保留speed,但优化默认值** (保守)

```typescript
// 前端默认值改为最大速度
const [speed, setSpeed] = useState(1000); // 1000x速度

// 后端限制最大速度
const intervalMs = Math.max(1, 1000 / speed); // 最小1ms
```

**优点**:
- ✅ 最小改动 - 只改默认值
- ✅ 保留灵活性 - 仍可调整速度

**缺点**:
- ❌ 仍有延迟 - 1ms间隔仍然慢
- ❌ 治标不治本 - 没有解决根本问题

---

## 📊 性能对比

假设回测 **1年的5分钟K线** (105,120根):

| 方案 | 推送方式 | 预计耗时 | 适用场景 |
|------|---------|---------|---------|
| **当前 (speed=1)** | 1秒/根 | 29小时 | ❌ 太慢 |
| **当前 (speed=10)** | 0.1秒/根 | 2.9小时 | ⚠️ 仍然慢 |
| **当前 (speed=1000)** | 1ms/根 | 105秒 | ⚠️ 可接受 |
| **方案A (speed=0)** | 同步批量 | **<10秒** | ✅ 推荐 |
| **方案B (移除speed)** | 同步全量 | **<5秒** | ✅ 最快 |

**实际测试** (需要验证):
- 策略逻辑复杂度
- 数据库查询耗时
- 内存占用
- CPU使用率

---

## 🎯 推荐方案

### **方案A: 添加"最快速度"模式**

**理由**:
1. ✅ **向后兼容** - 不破坏现有功能
2. ✅ **灵活性** - 支持调试(慢速)和生产(快速)
3. ✅ **性能最优** - 同步推送,无延迟
4. ✅ **用户友好** - 前端可以简单切换

**实现步骤**:
1. 修改 `DataFeedService.replay()` 方法
2. 添加 `replaySynchronous()` 私有方法
3. 前端添加"快速回测"开关
4. 更新文档和测试

---

## 🔧 需要修改的文件

### 后端 (2个文件)
1. ✅ `backend/src/backtesting/execution/services/data-feed.service.ts`
   - 添加 `replaySynchronous()` 方法
   - 修改 `replay()` 方法判断逻辑

2. ✅ `backend/src/backtesting/execution/interfaces/execution.interface.ts`
   - 添加 `fastMode?: boolean` 到 `ExecutionConfig`
   - 或保持 `speed: number`,约定 `speed=0` 表示最快

### 前端 (2个文件)
1. ✅ `frontend/src/modules/backtesting/services/executionApi.ts`
   - 添加 `fastMode?: boolean` 或保持 `speed: number`

2. ✅ `frontend/src/modules/backtesting/components/ExecutionControl.tsx`
   - 添加"快速回测"开关
   - 或简化speed滑块,添加"最快"预设按钮

---

## 📝 前端UI建议

### 选项1: 开关 + 滑块
```tsx
<Form.Item label="回测模式">
  <Space direction="vertical" style={{ width: '100%' }}>
    <Switch 
      checked={fastMode} 
      onChange={setFastMode}
      checkedChildren="快速回测"
      unCheckedChildren="调试模式"
    />
    
    {!fastMode && (
      <>
        <Text type="secondary">回放速度: {speed}x</Text>
        <Slider
          min={0.1}
          max={10}
          step={0.1}
          value={speed}
          onChange={setSpeed}
          marks={{ 0.1: '0.1x', 1: '1x', 5: '5x', 10: '10x' }}
        />
      </>
    )}
  </Space>
</Form.Item>
```

### 选项2: 预设按钮
```tsx
<Form.Item label="回放速度">
  <Space>
    <Button 
      type={speed === 0 ? 'primary' : 'default'}
      onClick={() => setSpeed(0)}
    >
      ⚡ 最快
    </Button>
    <Button 
      type={speed === 1 ? 'primary' : 'default'}
      onClick={() => setSpeed(1)}
    >
      标准 (1x)
    </Button>
    <Button 
      type={speed === 0.5 ? 'primary' : 'default'}
      onClick={() => setSpeed(0.5)}
    >
      慢速 (0.5x)
    </Button>
  </Space>
  
  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
    {speed === 0 && '⚡ 最快速度 - 无延迟推送'}
    {speed === 1 && '标准速度 - 每秒1根K线'}
    {speed === 0.5 && '慢速模式 - 适合调试'}
  </Text>
</Form.Item>
```

---

## ✅ 结论

### 回答用户的问题:

> **"我们是交易回测平台大多数情况下我们是寄希望越快越好。所有应该交易在上一跟K线的交易结束后马上就可以推送下一根K线。但是你需要调研下我们回测框架是否支持."**

**答案**: 
1. ✅ **当前框架支持调整速度**,但基于定时器,有性能瓶颈
2. ✅ **可以改造为"无延迟"模式**,实现最快速度
3. ✅ **推荐方案A**: 添加 `speed=0` 表示最快速度,保留灵活性

### 下一步行动:

**需要您确认**:
1. ✅ 是否采用**方案A**(推荐)?
2. ✅ 前端UI使用**开关**还是**预设按钮**?
3. ✅ 是否需要保留"调试模式"(慢速回放)?

**确认后我将立即实施**:
1. 修改后端 `DataFeedService`
2. 更新前端 `ExecutionControl`
3. 更新接口定义
4. 添加测试
5. 更新文档

---

**调研完成时间**: 2025-11-11 02:00  
**状态**: ✅ 调研完成,等待确认方案  
**推荐**: 方案A - 添加"最快速度"模式 (speed=0)
