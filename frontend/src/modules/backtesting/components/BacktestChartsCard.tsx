import React, { useEffect, useRef } from 'react';
import { Card, Alert, Space, Tabs } from 'antd';
import { Line, DualAxes } from '@antv/g2plot';
import { LineChartOutlined } from '@ant-design/icons';
import type { BacktestTask } from '../../../shared/api/backtestTasks';

interface BacktestChartsCardProps {
  task: BacktestTask;
}

/**
 * 回测图表卡片组件
 * 使用 AntV G2Plot 绘制权益曲线和回撤曲线
 */
export const BacktestChartsCard: React.FC<BacktestChartsCardProps> = ({
  task,
}) => {
  const equityChartRef = useRef<HTMLDivElement>(null);
  const drawdownChartRef = useRef<HTMLDivElement>(null);
  const combinedChartRef = useRef<HTMLDivElement>(null);

  const equityPlotRef = useRef<Line | null>(null);
  const drawdownPlotRef = useRef<Line | null>(null);
  const combinedPlotRef = useRef<DualAxes | null>(null);
  const destroyPlotRef = <T extends { destroy: () => void; destroyed?: boolean }>(
    plotRef: React.MutableRefObject<T | null>,
  ) => {
    if (plotRef.current && !(plotRef.current as any).destroyed) {
      plotRef.current.destroy();
    }
    plotRef.current = null;
  };

  /**
   * 生成模拟的权益曲线数据
   * TODO: 后续从后端API获取实际的时间序列数据
   */
  const generateEquityData = () => {
    const { initialCapital } = task.executionConfig;
    const { finalCapital, processedBars } = task.resultSummary!;

    // 生成模拟数据点（基于初始资金、最终资金和Bar数）
    const data: { date: string; equity: number; benchmark: number }[] = [];
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;

    for (let i = 0; i <= Math.min(processedBars, 100); i++) {
      const progress = i / Math.min(processedBars, 100);

      // 模拟波动的权益曲线（S型曲线 + 随机波动）
      const baseGrowth = progress * totalReturn;
      const randomWalk = Math.sin(i * 0.3) * 5 + Math.random() * 3;
      const equityReturn = baseGrowth + randomWalk;
      const equity = initialCapital * (1 + equityReturn / 100);

      // 模拟基准线（匀速增长）
      const benchmark = initialCapital * (1 + (progress * totalReturn * 0.5) / 100);

      data.push({
        date: `Day ${i}`,
        equity: Number(equity.toFixed(2)),
        benchmark: Number(benchmark.toFixed(2)),
      });
    }

    return data;
  };

  /**
   * 生成模拟的回撤数据
   * TODO: 后续从后端API获取实际的回撤数据
   */
  const generateDrawdownData = () => {
    const { maxDrawdown, processedBars } = task.resultSummary!;

    const data: { date: string; drawdown: number }[] = [];

    for (let i = 0; i <= Math.min(processedBars, 100); i++) {
      const progress = i / Math.min(processedBars, 100);

      // 模拟回撤曲线（在最大回撤范围内波动）
      const baseDrawdown = Math.abs(Math.sin(i * 0.2) * maxDrawdown * 0.8);
      const randomFactor = Math.random() * maxDrawdown * 0.2;
      const drawdown = -(baseDrawdown + randomFactor);

      data.push({
        date: `Day ${i}`,
        drawdown: Number(drawdown.toFixed(2)),
      });
    }

    return data;
  };

  /**
   * 渲染权益曲线图
   */
  useEffect(() => {
    if (!equityChartRef.current || !task.resultSummary) return;

    // 销毁旧图表
    destroyPlotRef(equityPlotRef);

    const data = generateEquityData();

    const linePlot = new Line(equityChartRef.current, {
      data,
      xField: 'date',
      yField: 'equity',
      seriesField: 'type',
      smooth: true,
      animation: {
        appear: {
          animation: 'path-in',
          duration: 1000,
        },
      },
      lineStyle: {
        lineWidth: 2,
      },
      color: '#52c41a',
      point: {
        size: 0,
      },
      xAxis: {
        title: {
          text: '时间',
        },
        label: {
          autoRotate: true,
          autoHide: true,
        },
      },
      yAxis: {
        title: {
          text: '权益 ($)',
        },
        label: {
          formatter: (v: string) => {
            return `$${Number(v).toLocaleString()}`;
          },
        },
      },
      tooltip: {
        formatter: (datum: any) => {
          return {
            name: '权益',
            value: `$${datum.equity.toLocaleString()}`,
          };
        },
      },
      annotations: [
        // 初始资金水平线
        {
          type: 'line',
          start: ['min', task.executionConfig.initialCapital],
          end: ['max', task.executionConfig.initialCapital],
          style: {
            stroke: '#8c8c8c',
            lineDash: [4, 4],
          },
          text: {
            content: '初始资金',
            position: 'end',
            offsetY: -5,
            style: {
              fill: '#8c8c8c',
              fontSize: 12,
            },
          },
        },
      ],
    });

    linePlot.render();
    equityPlotRef.current = linePlot;

    return () => {
      destroyPlotRef(equityPlotRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.resultSummary]);

  /**
   * 渲染回撤曲线图
   */
  useEffect(() => {
    if (!drawdownChartRef.current || !task.resultSummary) return;

    // 销毁旧图表
    destroyPlotRef(drawdownPlotRef);

    const data = generateDrawdownData();

    const linePlot = new Line(drawdownChartRef.current, {
      data,
      xField: 'date',
      yField: 'drawdown',
      smooth: true,
      animation: {
        appear: {
          animation: 'path-in',
          duration: 1000,
        },
      },
      lineStyle: {
        lineWidth: 2,
      },
      color: '#ff4d4f',
      areaStyle: {
        fill: 'l(270) 0:#ff4d4f33 1:#ff4d4f00',
      },
      point: {
        size: 0,
      },
      xAxis: {
        title: {
          text: '时间',
        },
        label: {
          autoRotate: true,
          autoHide: true,
        },
      },
      yAxis: {
        title: {
          text: '回撤 (%)',
        },
        label: {
          formatter: (v: string) => {
            return `${v}%`;
          },
        },
      },
      tooltip: {
        formatter: (datum: any) => {
          return {
            name: '回撤',
            value: `${datum.drawdown.toFixed(2)}%`,
          };
        },
      },
      annotations: [
        // 最大回撤水平线
        {
          type: 'line',
          start: ['min', -task.resultSummary.maxDrawdown],
          end: ['max', -task.resultSummary.maxDrawdown],
          style: {
            stroke: '#cf1322',
            lineDash: [4, 4],
          },
          text: {
            content: `最大回撤: ${task.resultSummary.maxDrawdown.toFixed(2)}%`,
            position: 'end',
            offsetY: -5,
            style: {
              fill: '#cf1322',
              fontSize: 12,
            },
          },
        },
      ],
    });

    linePlot.render();
    drawdownPlotRef.current = linePlot;

    return () => {
      destroyPlotRef(drawdownPlotRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.resultSummary]);

  /**
   * 渲染组合图表（权益+回撤双轴）
   */
  useEffect(() => {
    if (!combinedChartRef.current || !task.resultSummary) return;

    // 销毁旧图表
    destroyPlotRef(combinedPlotRef);

    const equityData = generateEquityData();
    const drawdownData = generateDrawdownData();

    const dualAxesPlot = new DualAxes(combinedChartRef.current, {
      data: [equityData, drawdownData],
      xField: 'date',
      yField: ['equity', 'drawdown'],
      animation: {
        appear: {
          animation: 'path-in',
          duration: 1000,
        },
      },
      geometryOptions: [
        {
          geometry: 'line',
          smooth: true,
          color: '#52c41a',
          lineStyle: {
            lineWidth: 2,
          },
          point: {
            size: 0,
          },
        },
        {
          geometry: 'line',
          smooth: true,
          color: '#ff4d4f',
          lineStyle: {
            lineWidth: 2,
          },
          point: {
            size: 0,
          },
        },
      ],
      xAxis: {
        title: {
          text: '时间',
        },
        label: {
          autoRotate: true,
          autoHide: true,
        },
      },
      yAxis: {
        equity: {
          title: {
            text: '权益 ($)',
          },
          label: {
            formatter: (v: string) => {
              return `$${Number(v).toLocaleString()}`;
            },
          },
        },
        drawdown: {
          title: {
            text: '回撤 (%)',
          },
          label: {
            formatter: (v: string) => {
              return `${v}%`;
            },
          },
        },
      },
      legend: {
        itemName: {
          formatter: (text: string) => {
            return text === 'equity' ? '权益' : '回撤';
          },
        },
      },
      tooltip: {
        shared: true,
      },
    });

    dualAxesPlot.render();
    combinedPlotRef.current = dualAxesPlot;

    return () => {
      destroyPlotRef(combinedPlotRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.resultSummary]);

  // 如果没有结果数据，显示提示
  if (!task.resultSummary) {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#13c2c2' }} />
            <span>权益曲线与回撤分析</span>
          </Space>
        }
      >
        <Alert
          message="数据不可用"
          description="回测任务尚未完成或结果数据生成失败"
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <LineChartOutlined style={{ color: '#13c2c2' }} />
          <span>权益曲线与回撤分析</span>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 数据说明提示 */}
        <Alert
          message="图表数据说明"
          description="当前图表基于回测结果摘要生成模拟曲线。完整的时间序列数据将在后续版本中从后端API获取。"
          type="info"
          showIcon
          closable
        />

        {/* Tab切换不同视图 */}
        <Tabs
          defaultActiveKey="equity"
          items={[
            {
              key: 'equity',
              label: '权益曲线',
              children: (
                <div
                  ref={equityChartRef}
                  style={{ width: '100%', height: 400 }}
                />
              ),
            },
            {
              key: 'drawdown',
              label: '回撤曲线',
              children: (
                <div
                  ref={drawdownChartRef}
                  style={{ width: '100%', height: 400 }}
                />
              ),
            },
            {
              key: 'combined',
              label: '组合视图',
              children: (
                <div
                  ref={combinedChartRef}
                  style={{ width: '100%', height: 400 }}
                />
              ),
            },
          ]}
        />
      </Space>
    </Card>
  );
};

export default BacktestChartsCard;
