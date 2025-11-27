import React, { useEffect, useRef, useState } from 'react';
import { Card, Alert, Space, Tabs, Spin, message } from 'antd';
import { Line, DualAxes } from '@antv/g2plot';
import { LineChartOutlined } from '@ant-design/icons';
import type { BacktestTask } from '../../../shared/api/backtestTasks';
import { 
  fetchEquityCurve, 
  calculateDrawdownFromEquity,
  type EquityPoint,
  type DrawdownPoint
} from '../../../shared/api/backtesting';

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

  // 数据状态
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [drawdownData, setDrawdownData] = useState<DrawdownPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState(false);

  const destroyPlotRef = <T extends { destroy: () => void; destroyed?: boolean }>(
    plotRef: React.MutableRefObject<T | null>,
  ) => {
    if (plotRef.current && !(plotRef.current as any).destroyed) {
      plotRef.current.destroy();
    }
    plotRef.current = null;
  };

  /**
   * 从API加载真实的权益曲线数据
   */
  useEffect(() => {
    const loadEquityData = async () => {
      if (!task.resultSummary || !task.taskId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 尝试从API获取真实数据
        const data = await fetchEquityCurve(task.taskId);
        
        if (data && data.length > 0) {
          setEquityData(data);
          
          // 计算回撤数据
          const drawdown = calculateDrawdownFromEquity(
            data,
            task.executionConfig.initialCapital
          );
          setDrawdownData(drawdown);
          
          setUseMockData(false);
        } else {
          // 如果没有数据，使用模拟数据
          console.warn('[BacktestChartsCard] No equity data available, using mock data');
          setUseMockData(true);
          generateMockData();
        }
      } catch (err: any) {
        console.error('[BacktestChartsCard] Failed to load equity data:', err);
        
        // API加载失败，使用模拟数据
        setUseMockData(true);
        generateMockData();
        
        message.warning('无法加载权益曲线数据，使用模拟数据展示');
      } finally {
        setLoading(false);
      }
    };

    loadEquityData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.taskId, task.resultSummary]);

  /**
   * 生成模拟数据（作为后备方案）
   */
  const generateMockData = () => {
    const { initialCapital } = task.executionConfig;
    const { finalCapital, processedBars } = task.resultSummary!;

    // 生成模拟权益数据
    const mockEquity: EquityPoint[] = [];
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;

    for (let i = 0; i <= Math.min(processedBars, 100); i++) {
      const progress = i / Math.min(processedBars, 100);
      
      const baseGrowth = progress * totalReturn;
      const randomWalk = Math.sin(i * 0.3) * 5 + Math.random() * 3;
      const equityReturn = baseGrowth + randomWalk;
      const equity = initialCapital * (1 + equityReturn / 100);

      mockEquity.push({
        datetime: `Day ${i}`,
        value: Number(equity.toFixed(2)),
        cash: Number((equity * 0.3).toFixed(2)), // 假设30%是现金
      });
    }

    setEquityData(mockEquity);

    // 生成模拟回撤数据
    const mockDrawdown = calculateDrawdownFromEquity(mockEquity, initialCapital);
    setDrawdownData(mockDrawdown);
  };

  /**
   * 渲染权益曲线图
   */
  useEffect(() => {
    if (!equityChartRef.current || !task.resultSummary || loading || equityData.length === 0) {
      return;
    }

    // 销毁旧图表
    destroyPlotRef(equityPlotRef);

    // 转换数据格式
    const chartData = equityData.map(point => ({
      datetime: point.datetime,
      value: point.value,
    }));

    const linePlot = new Line(equityChartRef.current, {
      data: chartData,
      xField: 'datetime',
      yField: 'value',
      smooth: true,
      animation: {
        appear: {
          animation: 'fade-in',
          duration: 500,
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
          formatter: (text: string) => {
            // 如果是日期格式，进行格式化
            if (text.includes('-') || text.includes('T')) {
              try {
                const date = new Date(text);
                return date.toLocaleString('zh-CN', { 
                  month: '2-digit', 
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } catch {
                return text;
              }
            }
            return text;
          },
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
            value: `$${Number(datum.value).toLocaleString()}`,
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
  }, [equityData, loading]);

  /**
   * 渲染回撤曲线图
   */
  useEffect(() => {
    if (!drawdownChartRef.current || !task.resultSummary || loading || drawdownData.length === 0) {
      return;
    }

    // 销毁旧图表
    destroyPlotRef(drawdownPlotRef);

    // 转换数据格式
    const chartData = drawdownData.map(point => ({
      datetime: point.datetime,
      drawdown: point.drawdownPercent,
    }));

    const linePlot = new Line(drawdownChartRef.current, {
      data: chartData,
      xField: 'datetime',
      yField: 'drawdown',
      smooth: true,
      animation: {
        appear: {
          animation: 'fade-in',
          duration: 500,
        },
      },
      lineStyle: {
        lineWidth: 2,
      },
      color: '#ff4d4f',
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
          formatter: (text: string) => {
            if (text.includes('-') || text.includes('T')) {
              try {
                const date = new Date(text);
                return date.toLocaleString('zh-CN', { 
                  month: '2-digit', 
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } catch {
                return text;
              }
            }
            return text;
          },
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
  }, [drawdownData, loading]);

  /**
   * 渲染组合图表（权益+回撤双轴）
   */
  useEffect(() => {
    if (!combinedChartRef.current || !task.resultSummary || loading || 
        equityData.length === 0 || drawdownData.length === 0) {
      return;
    }

    // 销毁旧图表
    destroyPlotRef(combinedPlotRef);

    // 转换数据格式
    const equityChartData = equityData.map(point => ({
      datetime: point.datetime,
      value: point.value,
    }));

    const drawdownChartData = drawdownData.map(point => ({
      datetime: point.datetime,
      value: point.drawdownPercent,
    }));

    const dualAxesPlot = new DualAxes(combinedChartRef.current, {
      data: [equityChartData, drawdownChartData],
      xField: 'datetime',
      yField: ['value', 'value'],
      animation: {
        appear: {
          animation: 'fade-in',
          duration: 500,
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
          formatter: (text: string) => {
            if (text.includes('-') || text.includes('T')) {
              try {
                const date = new Date(text);
                return date.toLocaleString('zh-CN', { 
                  month: '2-digit', 
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } catch {
                return text;
              }
            }
            return text;
          },
        },
      },
      yAxis: {
        value: {
          title: {
            text: '权益 ($)',
          },
          label: {
            formatter: (v: string) => {
              return `$${Number(v).toLocaleString()}`;
            },
          },
        },
      },
      legend: {
        itemName: {
          formatter: (_text: string, item: any) => {
            // 根据颜色判断是哪条线
            return item.color === '#52c41a' ? '权益' : '回撤';
          },
        },
      },
      tooltip: {
        shared: true,
        formatter: (datum: any) => {
          if (datum.value > 1000) {
            // 权益数据
            return {
              name: '权益',
              value: `$${Number(datum.value).toLocaleString()}`,
            };
          } else {
            // 回撤数据
            return {
              name: '回撤',
              value: `${datum.value.toFixed(2)}%`,
            };
          }
        },
      },
    });

    dualAxesPlot.render();
    combinedPlotRef.current = dualAxesPlot;

    return () => {
      destroyPlotRef(combinedPlotRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityData, drawdownData, loading]);

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
      {/* 加载状态 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="加载权益曲线数据..." />
        </div>
      )}

      {/* 错误提示 */}
      {error && !loading && (
        <Alert
          message="数据加载失败"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 图表内容 */}
      {!loading && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 数据说明提示 */}
          {useMockData && (
            <Alert
              message="使用模拟数据"
              description="当前图表基于回测结果摘要生成模拟曲线。实际权益曲线数据尚未生成或加载失败。"
              type="warning"
              showIcon
              closable
            />
          )}
          
          {!useMockData && (
            <Alert
              message="真实数据"
              description="当前图表展示的是回测过程中实际记录的权益曲线数据。"
              type="success"
              showIcon
              closable
            />
          )}

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
      )}
    </Card>
  );
};

export default BacktestChartsCard;
