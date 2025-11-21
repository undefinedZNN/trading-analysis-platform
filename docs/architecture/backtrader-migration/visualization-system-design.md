# 可视化系统设计方案

**版本**: v1.0  
**创建时间**: 2025-11-20  
**状态**: 需求调研阶段

---

## 📋 核心问题

1. **绩效曲线展示**：使用 Backtrader 内置还是自定义前端渲染？
2. **因子分布图**：如何可视化因子数据？
3. **交易点位标注**：如何在 K 线图上标注买卖点？
4. **报告导出**：HTML 还是 PDF？支持自定义模板吗？

---

## 🎯 可视化需求清单

### 1. 绩效曲线

**必需图表**：
- ✅ 账户权益曲线（Account Value）
- ✅ 收益曲线（Returns）
- ✅ 回撤曲线（Drawdown）
- ✅ 持仓变化（Position）

**可选图表**：
- 资金利用率
- 胜率走势
- 平均盈亏走势

---

### 2. 交易分析

**交易列表**：
- 交易明细表（带分页、排序、筛选）
- 交易统计卡片（总交易数、胜率、盈亏比等）

**交易分布**：
- 盈亏分布直方图
- 持仓时长分布
- 交易时段分布

---

### 3. 因子分析

**因子分布图**：
- 因子值分布（直方图）
- 因子与盈亏的散点图
- 因子相关性热力图

**因子筛选**：
- 交互式筛选器
- 实时更新统计

---

### 4. K 线图

**基础图表**：
- K 线图（OHLC）
- 成交量柱状图
- 技术指标叠加（MA、RSI、MACD等）

**交易标注**：
- 买入点标记（绿色向上箭头）
- 卖出点标记（红色向下箭头）
- 交易盈亏标注

---

### 5. 报告导出

**导出格式**：
- HTML 报告（在线查看）
- PDF 报告（离线分享）
- Excel 数据（数据分析）

**报告内容**：
- 回测摘要
- 绩效图表
- 交易明细
- 因子分析

---

## 🎨 方案对比

### 方案 A：Backtrader 内置可视化 + 前端基础展示

**Backtrader 部分**：
```python
import backtrader as bt

# Backtrader 内置的 Plotter
cerebro = bt.Cerebro()
cerebro.addstrategy(MyStrategy)
# ... 运行回测
cerebro.plot(
    style='candlestick',  # K线样式
    barup='green',        # 上涨颜色
    bardown='red',        # 下跌颜色
    volume=True,          # 显示成交量
)
# 输出 HTML 文件到共享存储
```

**前端部分**：
- 嵌入 Backtrader 生成的 HTML
- 显示基础的统计表格
- 简单的交易列表

**优点**：
- ✅ 实现快速，Backtrader 自带
- ✅ K 线图和指标自动绘制
- ✅ 开发成本低

**缺点**：
- ❌ 交互性差（静态图表）
- ❌ 样式不可控
- ❌ 无法与前端系统深度集成
- ❌ 移动端体验差

**适用场景**：
- POC 阶段快速验证
- 简单的回测查看

---

### 方案 B：纯前端可视化（AntV G2） ⭐ 推荐

**数据导出**：
```python
# Worker 导出结构化数据（JSON + Parquet）
export_data = {
    # 绩效曲线数据
    "equity_curve": [
        {"datetime": "2023-01-01", "value": 100000},
        {"datetime": "2023-01-02", "value": 100500},
        # ...
    ],
    
    # 交易数据（已有 Parquet）
    "trades_file": "/data/backtests/task_id/trades.parquet",
    
    # K线数据（如果需要）
    "ohlcv_data": [...],
    
    # 指标数据
    "indicators": {
        "sma_fast": [...],
        "sma_slow": [...],
        "rsi": [...]
    },
    
    # 统计指标
    "metrics": {
        "total_return": 0.15,
        "sharpe_ratio": 1.5,
        "max_drawdown": -0.08,
        # ...
    }
}
```

**前端渲染**：
```tsx
import * as echarts from 'echarts';
import { Table, Statistic, Card } from 'antd';

function BacktestResultPage() {
  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="总收益" value={15.5} suffix="%" />
          </Card>
        </Col>
        {/* 更多统计卡片 */}
      </Row>
      
      {/* 权益曲线 */}
      <EquityCurveChart data={equityCurve} />
      
      {/* 交易列表 */}
      <TradesTable data={trades} factors={factorSchema} />
      
      {/* 因子分析 */}
      <FactorAnalysis trades={trades} factors={factorSchema} />
      
      {/* K线图（可选） */}
      <KLineChart 
        ohlcv={ohlcvData} 
        trades={trades}
        indicators={indicators}
      />
    </div>
  );
}
```

**优点**：
- ✅ 交互性强（缩放、tooltip、筛选）
- ✅ 样式完全可控，与系统一致
- ✅ 深度集成（因子筛选、数据联动）
- ✅ 移动端友好
- ✅ 可以渐进式加载大量数据

**缺点**：
- ⚠️ 开发成本较高
- ⚠️ 需要设计图表组件

**适用场景**：
- ✅ 正式生产环境
- ✅ 需要高质量用户体验

---

### 方案 C：混合方案

**Backtrader 用于**：
- K 线图 + 指标叠加（快速生成）
- 作为快速预览

**前端 AntV (G2) 用于**：
- 绩效曲线（可交互）
- 交易统计（表格、卡片）
- 因子分析（高级筛选）

**优点**：
- ✅ 兼顾开发速度和用户体验
- ✅ K 线图使用 Backtrader 自动生成
- ✅ 核心交互使用前端

**缺点**：
- ⚠️ 技术栈混合，维护成本略高

---

## 📊 详细设计（方案 B）

### 1. 权益曲线

**数据格式**：
```json
{
  "equity_curve": [
    {"datetime": "2023-01-01 09:30", "value": 100000},
    {"datetime": "2023-01-01 10:00", "value": 100200},
    {"datetime": "2023-01-01 10:30", "value": 99800}
  ]
}
```

**AntV G2 配置**：
```typescript
const equityChartConfig = {
  title: { text: '账户权益曲线' },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'time',
    data: equityCurve.map(d => d.datetime)
  },
  yAxis: {
    type: 'value',
    name: '账户权益'
  },
  series: [{
    name: '权益',
    type: 'line',
    data: equityCurve.map(d => d.value),
    smooth: true,
    lineStyle: { width: 2 },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
        { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
      ])
    }
  }]
};
```

---

### 2. 回撤曲线

**数据格式**：
```json
{
  "drawdown_curve": [
    {"datetime": "2023-01-01", "value": 0},
    {"datetime": "2023-01-02", "value": -0.02},
    {"datetime": "2023-01-03", "value": -0.05}
  ]
}
```

**AntV G2 配置**：
```typescript
const drawdownChartConfig = {
  title: { text: '回撤曲线' },
  tooltip: { trigger: 'axis', formatter: '{b}: {c}%' },
  xAxis: { type: 'time' },
  yAxis: {
    type: 'value',
    name: '回撤',
    axisLabel: { formatter: '{value}%' }
  },
  series: [{
    name: '回撤',
    type: 'line',
    data: drawdownCurve.map(d => [d.datetime, d.value * 100]),
    areaStyle: { color: 'rgba(255, 0, 0, 0.2)' },
    lineStyle: { color: '#ff4d4f' }
  }],
  // 标注最大回撤
  markPoint: {
    data: [{ type: 'min', name: '最大回撤' }]
  }
};
```

---

### 3. 交易点位标注（K线图）

**数据格式**：
```json
{
  "ohlcv": [
    ["2023-01-01", 100, 105, 99, 103, 1000000],
    ["2023-01-02", 103, 108, 102, 107, 1200000]
  ],
  "trades": [
    {"datetime": "2023-01-01 10:00", "type": "buy", "price": 103, "pnl": null},
    {"datetime": "2023-01-02 14:00", "type": "sell", "price": 107, "pnl": 400}
  ]
}
```

**AntV G2 配置**：
```typescript
const klineChartConfig = {
  title: { text: 'K线图 + 交易点位' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ohlcv.map(d => d[0]) },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'K线',
      type: 'candlestick',
      data: ohlcv.map(d => [d[1], d[4], d[2], d[3]]) // open, close, high, low
    },
    {
      name: '买入',
      type: 'scatter',
      data: trades
        .filter(t => t.type === 'buy')
        .map(t => [t.datetime, t.price]),
      symbol: 'triangle',
      symbolSize: 15,
      itemStyle: { color: '#52c41a' }
    },
    {
      name: '卖出',
      type: 'scatter',
      data: trades
        .filter(t => t.type === 'sell')
        .map(t => [t.datetime, t.price]),
      symbol: 'triangle',
      symbolSize: 15,
      symbolRotate: 180,
      itemStyle: { color: '#ff4d4f' }
    }
  ]
};
```

---

### 4. 因子分布图

**盈亏 vs 因子散点图**：
```typescript
const factorScatterOption = {
  title: { text: '入场 RSI vs 盈亏率' },
  tooltip: { trigger: 'item' },
  xAxis: {
    type: 'value',
    name: '入场 RSI',
    min: 0,
    max: 100
  },
  yAxis: {
    type: 'value',
    name: '盈亏率 (%)',
    axisLabel: { formatter: '{value}%' }
  },
  series: [{
    type: 'scatter',
    data: trades.map(t => [t.entry_rsi, t.pnl_percent * 100]),
    symbolSize: function (data) {
      return Math.abs(data[1]) * 2; // 根据盈亏大小调整点的大小
    },
    itemStyle: {
      color: function (params) {
        return params.data[1] > 0 ? '#52c41a' : '#ff4d4f';
      }
    }
  }]
};
```

---

### 5. 报告导出

#### HTML 报告

**后端生成**：
```python
from jinja2 import Template

html_template = """
<!DOCTYPE html>
<html>
<head>
  <title>回测报告 - {{ task_id }}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
</head>
<body>
  <h1>回测报告</h1>
  
  <h2>统计指标</h2>
  <table>
    <tr><td>总收益</td><td>{{ metrics.total_return }}%</td></tr>
    <tr><td>夏普比率</td><td>{{ metrics.sharpe_ratio }}</td></tr>
    <tr><td>最大回撤</td><td>{{ metrics.max_drawdown }}%</td></tr>
  </table>
  
  <h2>权益曲线</h2>
  <div id="equity-chart" style="width: 100%; height: 400px;"></div>
  <script>
    var chart = echarts.init(document.getElementById('equity-chart'));
    chart.setOption({{ equity_chart_option | tojson }});
  </script>
  
  <h2>交易明细</h2>
  <table>
    {% for trade in trades %}
    <tr>
      <td>{{ trade.entry_time }}</td>
      <td>{{ trade.pnl }}%</td>
    </tr>
    {% endfor %}
  </table>
</body>
</html>
"""

template = Template(html_template)
html_content = template.render(
    task_id=task_id,
    metrics=metrics,
    equity_chart_option=equity_chart_option,
    trades=trades
)

# 保存到共享存储
with open(f'/data/backtests/{task_id}/report.html', 'w') as f:
    f.write(html_content)
```

#### PDF 报告

**使用工具**：
- `wkhtmltopdf`：将 HTML 转 PDF
- `pdfkit`：Python 库

```python
import pdfkit

# 先生成 HTML
html_path = f'/data/backtests/{task_id}/report.html'
pdf_path = f'/data/backtests/{task_id}/report.pdf'

# 转换为 PDF
options = {
    'page-size': 'A4',
    'margin-top': '10mm',
    'margin-right': '10mm',
    'margin-bottom': '10mm',
    'margin-left': '10mm',
    'encoding': "UTF-8",
    'no-outline': None
}

pdfkit.from_file(html_path, pdf_path, options=options)
```

---

## 🎯 推荐方案

### POC 阶段：方案 A（Backtrader 内置）

**理由**：
- ✅ 快速验证功能
- ✅ 无需前端开发
- ✅ 专注于核心回测逻辑

**实现**：
```python
# POC 阶段简单使用 Backtrader plot
cerebro.plot(style='candlestick')
```

---

### 正式开发：方案 B（纯前端 AntV G2） ⭐

**理由**：
- ✅ 最佳用户体验
- ✅ 与系统深度集成
- ✅ 可扩展性强

**分阶段实现**：

**第一阶段（MVP）**：
- ✅ 权益曲线
- ✅ 回撤曲线
- ✅ 交易列表（基础表格）
- ✅ 统计卡片

**第二阶段**：
- ✅ 交易点位标注
- ✅ 因子筛选器
- ✅ 因子分布图
- ✅ HTML 报告导出

**第三阶段**：
- ✅ K 线图（完整）
- ✅ PDF 报告导出
- ✅ 高级因子分析
- ✅ 自定义报告模板

---

## 📊 Worker 端数据导出格式

```python
# Worker 完成回测后导出数据
export_result = {
    # 基础信息
    "task_id": "task-uuid",
    "strategy_name": "MA Cross",
    "start_date": "2023-01-01",
    "end_date": "2023-12-31",
    
    # 统计指标
    "metrics": {
        "initial_value": 100000,
        "final_value": 115000,
        "total_return": 0.15,
        "total_return_pct": 15.0,
        "sharpe_ratio": 1.5,
        "max_drawdown": -0.08,
        "max_drawdown_pct": -8.0,
        "total_trades": 50,
        "winning_trades": 30,
        "losing_trades": 20,
        "win_rate": 0.6,
        "avg_win": 500,
        "avg_loss": -300,
        "profit_factor": 1.67,
    },
    
    # 权益曲线（时间序列）
    "equity_curve": [
        {"datetime": "2023-01-01 09:30", "value": 100000, "cash": 100000, "position_value": 0},
        {"datetime": "2023-01-01 10:00", "value": 100200, "cash": 50000, "position_value": 50200},
        # ...
    ],
    
    # 回撤曲线
    "drawdown_curve": [
        {"datetime": "2023-01-01", "value": 0, "peak": 100000},
        {"datetime": "2023-01-02", "value": -0.02, "peak": 100500},
        # ...
    ],
    
    # 交易数据（Parquet 文件路径）
    "trades_file": "/data/backtests/task_id/trades.parquet",
    "trades_count": 50,
    
    # OHLCV 数据（如果需要 K 线图）
    "ohlcv_file": "/data/backtests/task_id/ohlcv.parquet",  # 可选
    
    # 指标数据（可选，用于 K 线图叠加）
    "indicators": {
        "sma_fast": {"file": "/data/backtests/task_id/sma_fast.parquet"},
        "sma_slow": {"file": "/data/backtests/task_id/sma_slow.parquet"},
        "rsi": {"file": "/data/backtests/task_id/rsi.parquet"}
    }
}

# 保存为 JSON
with open(f'/data/backtests/{task_id}/result.json', 'w') as f:
    json.dump(export_result, f, indent=2)
```

---

## ✅ 已确认的决策（2025-11-21）

### 1. K 线图是否需要？✅

**决策**：**B+（增强简化版）**

**需求说明**：
- ✅ K 线图（OHLC）
- ✅ 成交量柱状图
- ✅ 标注所有交易点位（支持多次加仓、多次减仓）
  - 首次建仓、加仓、减仓、止盈、止损、打平需清晰区分
  - 使用不同颜色和大小的标记
- ❌ 不需要技术指标叠加（MA、RSI、MACD 等）

**关键要求**：
- 一个策略可能会触发多次加仓入场
- 也可能出现多次分批止盈、止损、打平
- 每个交易点位都需要清晰标注

---

### 2. 报告导出格式 ✅

**决策**：**不需要导出**

**说明**：
- 用户只在前端页面查看
- 用户可以通过过滤交易因子生成多份不同视图的报告
- 前端实时应用过滤器，动态生成统计结果
- 暂不需要 HTML/PDF/Excel 导出功能

---

### 3. 自定义报告模板 ✅

**决策**：**A（不需要）**

使用固定模板，简化实现。

---

### 4. 实时图表更新 ✅

**决策**：**A（不需要）**

回测完成后再显示结果，符合离线回测场景。

---

### 5. 数据量限制处理 ✅

**决策**：**C（混合）**

- 统计指标和图表：使用聚合数据
- 交易明细列表：使用分页加载
- 因子过滤：前端筛选 + 实时更新

---

## 📚 相关文档

- [Backtrader 最终方案](./backtrader-final-solution.md)
- [因子系统设计](./factor-system-design.md)
- [Worker 通信设计](./worker-communication-design.md)

---

**状态**：✅ 所有问题已确认，可以进入实现阶段

