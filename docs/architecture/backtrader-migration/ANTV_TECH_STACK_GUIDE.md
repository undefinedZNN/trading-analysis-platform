# AntV 技术栈使用指南

**创建日期**: 2025-11-21  
**适用场景**: Backtrader 回测结果可视化

---

## 📖 AntV 简介

**AntV** 是蚂蚁金服开源的数据可视化解决方案，专注于提供简单、易用、可扩展的数据可视化能力。

**官网**: https://antv.vision/

---

## 🎯 为什么选择 AntV

### 相比 ECharts 的优势

| 特性 | AntV G2 | ECharts |
|------|---------|---------|
| **框架集成** | React 原生支持 | 需要封装 |
| **TypeScript** | 完整支持 | 部分支持 |
| **API 设计** | 语法化，易理解 | 配置化，学习曲线陡 |
| **性能** | 优秀（WebGL 可选） | 优秀 |
| **生态** | Ant Design 生态 | 独立生态 |
| **更新频率** | 高 | 中 |
| **中文文档** | 完善 | 完善 |

### 核心优势

1. **与 Ant Design 无缝集成** - 统一的设计语言
2. **TypeScript 友好** - 完整的类型定义
3. **React 友好** - 提供 React 组件封装
4. **语法简洁** - 链式 API，代码可读性强
5. **性能优异** - 大数据量下表现优秀
6. **社区活跃** - 蚂蚁集团维护，更新及时

---

## 📦 AntV 产品体系

### G2 - 统计图表 ⭐ 我们使用

**适用场景**: K线图、折线图、柱状图、饼图等

**特点**:
- 语法简洁，易上手
- 支持数十种图表类型
- 交互能力强
- 支持大数据量（10万+点）

**官网**: https://g2.antv.antgroup.com/

---

### G6 - 图可视化

**适用场景**: 关系图、流程图、组织架构图

**特点**:
- 支持自定义节点和边
- 内置多种布局算法
- 支持大规模图渲染（1万+节点）

**官网**: https://g6.antv.antgroup.com/

**本项目不使用**

---

### L7 - 地理空间可视化

**适用场景**: 地图、热力图、轨迹图

**本项目不使用**

---

### X6 - 图编辑引擎

**适用场景**: 流程图编辑器、ER图编辑器

**本项目不使用**

---

## 🚀 G2 快速上手

### 安装

```bash
npm install @antv/g2
# 或 React 组件版本
npm install @ant-design/charts
```

### React 项目推荐使用

```bash
npm install @ant-design/charts
```

`@ant-design/charts` 是基于 G2 封装的 React 组件库，更易用。

---

## 📊 常用图表示例

### 1. K线图（Candlestick Chart）

```tsx
import { Stock } from '@ant-design/charts';

const KLineChart = () => {
  const data = [
    { date: '2023-01-01', open: 100, high: 105, low: 99, close: 103 },
    { date: '2023-01-02', open: 103, high: 108, low: 102, close: 107 },
    // ... more data
  ];

  const config = {
    data,
    xField: 'date',
    yField: ['open', 'close', 'high', 'low'],
  };

  return <Stock {...config} />;
};
```

---

### 2. 带交易点位的 K线图 ⭐ 核心需求

```tsx
import { Stock } from '@ant-design/charts';
import { Chart } from '@ant-design/charts';

const KLineWithTrades = () => {
  // K线数据
  const klineData = [
    { date: '2023-01-01', open: 100, high: 105, low: 99, close: 103 },
    { date: '2023-01-02', open: 103, high: 108, low: 102, close: 107 },
  ];

  // 交易点位数据
  const tradeData = [
    { date: '2023-01-01', price: 103, type: 'buy', size: 100 },
    { date: '2023-01-02', price: 107, type: 'sell', size: 100 },
  ];

  return (
    <div>
      {/* K线图 */}
      <Stock
        data={klineData}
        xField="date"
        yField={['open', 'close', 'high', 'low']}
        // 叠加交易点位
        annotations={tradeData.map(trade => ({
          type: 'dataMarker',
          position: [trade.date, trade.price],
          text: {
            content: trade.type === 'buy' ? '买入' : '卖出',
            style: { fill: trade.type === 'buy' ? '#52c41a' : '#f5222d' },
          },
          point: {
            style: {
              fill: trade.type === 'buy' ? '#52c41a' : '#f5222d',
              r: 6,
            },
          },
        }))}
      />
    </div>
  );
};
```

---

### 3. 资金曲线图（Equity Curve）

```tsx
import { Line } from '@ant-design/charts';

const EquityCurve = () => {
  const data = [
    { date: '2023-01-01', equity: 100000 },
    { date: '2023-01-02', equity: 102000 },
    { date: '2023-01-03', equity: 101500 },
    // ... more data
  ];

  const config = {
    data,
    xField: 'date',
    yField: 'equity',
    point: {
      size: 3,
      shape: 'circle',
    },
    smooth: true,
    label: {
      style: {
        fill: '#aaa',
      },
    },
  };

  return <Line {...config} />;
};
```

---

### 4. 成交量柱状图（Volume Bar）

```tsx
import { Column } from '@ant-design/charts';

const VolumeChart = () => {
  const data = [
    { date: '2023-01-01', volume: 1000000 },
    { date: '2023-01-02', volume: 1200000 },
    // ... more data
  ];

  const config = {
    data,
    xField: 'date',
    yField: 'volume',
    columnStyle: {
      fill: '#5B8FF9',
    },
  };

  return <Column {...config} />;
};
```

---

### 5. 组合图表（K线 + 成交量）

```tsx
import { DualAxes } from '@ant-design/charts';

const KLineWithVolume = () => {
  const config = {
    data: [klineData, volumeData],
    xField: 'date',
    yField: ['close', 'volume'],
    geometryOptions: [
      {
        geometry: 'line',
        color: '#5B8FF9',
      },
      {
        geometry: 'column',
        color: '#5AD8A6',
      },
    ],
  };

  return <DualAxes {...config} />;
};
```

---

## 🎨 多次加仓/减仓标注

### 需求

- 不同大小的标记（根据交易量）
- 不同颜色（买入/卖出）
- 支持多次加仓（同一价格多个标记）

### 实现方案

```tsx
const TradeMarkers = ({ trades }) => {
  return (
    <>
      {trades.map((trade, index) => ({
        type: 'dataMarker',
        position: [trade.date, trade.price],
        text: {
          content: `${trade.type === 'buy' ? '买' : '卖'} ${trade.size}`,
          style: {
            fill: trade.type === 'buy' ? '#52c41a' : '#f5222d',
            fontSize: 12,
          },
          offsetY: trade.type === 'buy' ? -20 : 20,
        },
        point: {
          style: {
            fill: trade.type === 'buy' ? '#52c41a' : '#f5222d',
            r: Math.max(4, Math.min(10, trade.size / 10)), // 根据交易量调整大小
            fillOpacity: 0.8,
          },
        },
        // 加仓标记
        line: trade.isAddition ? {
          style: {
            stroke: trade.type === 'buy' ? '#52c41a' : '#f5222d',
            lineDash: [4, 4],
          },
        } : null,
      }))}
    </>
  );
};
```

---

## 📐 图表交互

### 缩放（Zoom）

```tsx
const config = {
  // ... other config
  slider: {
    start: 0,
    end: 1,
  },
};
```

### 拖拽（Pan）

```tsx
const config = {
  // ... other config
  interactions: [
    {
      type: 'brush',
    },
  ],
};
```

### 提示框（Tooltip）

```tsx
const config = {
  // ... other config
  tooltip: {
    showTitle: true,
    title: (datum) => datum.date,
    customContent: (title, items) => {
      return (
        <div>
          <h4>{title}</h4>
          <ul>
            {items.map((item, index) => (
              <li key={index}>
                <span>{item.name}: </span>
                <span>{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    },
  },
};
```

---

## 🎯 最佳实践

### 1. 大数据量优化

```tsx
// 使用数据采样
const config = {
  data: data.slice(0, 1000), // 只显示前 1000 个点
  // 或使用数据缩略
  xAxis: {
    type: 'timeCat',
    mask: 'YYYY-MM-DD',
  },
};
```

### 2. 响应式布局

```tsx
const config = {
  autoFit: true, // 自动适应容器大小
  padding: 'auto',
};
```

### 3. 主题定制

```tsx
import { getTheme } from '@ant-design/charts';

// 使用内置主题
const config = {
  theme: 'dark', // 或 'default'
};

// 自定义主题
const config = {
  theme: {
    colors10: ['#FF6B3B', '#626681', '#FFC100', '#9FB40F', '#76523B'],
    // ... more theme config
  },
};
```

---

## 📚 学习资源

### 官方文档

- **G2 官网**: https://g2.antv.antgroup.com/
- **@ant-design/charts**: https://charts.ant.design/
- **API 文档**: https://g2.antv.antgroup.com/api/
- **示例库**: https://g2.antv.antgroup.com/examples/

### 教程

- **快速开始**: https://g2.antv.antgroup.com/manual/getting-started
- **核心概念**: https://g2.antv.antgroup.com/manual/core-concepts
- **常见问题**: https://g2.antv.antgroup.com/manual/faq

### 社区

- **GitHub**: https://github.com/antvis/G2
- **语雀**: https://www.yuque.com/antv
- **钉钉群**: 搜索"AntV"

---

## 🛠️ 开发建议

### 项目结构

```
src/
├── components/
│   ├── charts/
│   │   ├── KLineChart.tsx        # K线图组件
│   │   ├── EquityCurve.tsx       # 资金曲线
│   │   ├── VolumeChart.tsx       # 成交量
│   │   └── TradeMarkers.tsx      # 交易点位标记
│   └── ...
├── utils/
│   └── chartConfig.ts            # 图表配置
└── ...
```

### 组件封装

```tsx
// components/charts/KLineChart.tsx
import React from 'react';
import { Stock } from '@ant-design/charts';

interface KLineChartProps {
  data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  trades?: Array<{
    date: string;
    price: number;
    type: 'buy' | 'sell';
    size: number;
  }>;
}

export const KLineChart: React.FC<KLineChartProps> = ({ data, trades = [] }) => {
  const config = {
    data,
    xField: 'date',
    yField: ['open', 'close', 'high', 'low'],
    annotations: trades.map(trade => ({
      type: 'dataMarker',
      position: [trade.date, trade.price],
      point: {
        style: {
          fill: trade.type === 'buy' ? '#52c41a' : '#f5222d',
        },
      },
    })),
  };

  return <Stock {...config} />;
};
```

---

## 🚨 注意事项

1. **性能优化**: 大数据量（>10万点）时使用数据采样或缩略
2. **内存管理**: 及时销毁不用的图表实例
3. **TypeScript**: 充分利用类型定义，减少运行时错误
4. **响应式**: 使用 `autoFit` 自动适应容器
5. **主题一致性**: 使用 Ant Design 主题保持风格统一

---

## 📞 技术支持

**问题反馈**: 
- 项目内部技术群
- GitHub Issues: https://github.com/antvis/G2/issues

**文档维护**: Frontend 团队  
**最后更新**: 2025-11-21

---

**祝开发顺利！** 🎉

