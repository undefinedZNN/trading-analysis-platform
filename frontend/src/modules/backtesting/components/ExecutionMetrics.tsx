/**
 * 执行指标组件
 */

import React, { useEffect, useRef } from 'react';
import { Card, Row, Col, Statistic, Progress } from 'antd';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import type { ExecutionMetrics, ResourceStats } from '../services/executionApi';
import './ExecutionMetrics.less';

interface ExecutionMetricsProps {
  metrics?: ExecutionMetrics;
  metricsHistory?: ExecutionMetrics[];
  resourceStats?: ResourceStats;
}

export const ExecutionMetricsComponent: React.FC<ExecutionMetricsProps> = ({
  metrics,
  metricsHistory = [],
  resourceStats,
}) => {
  const latencyChartRef = useRef<HTMLDivElement>(null);
  const throughputChartRef = useRef<HTMLDivElement>(null);
  const latencyChart = useRef<ECharts>();
  const throughputChart = useRef<ECharts>();

  // 初始化图表
  useEffect(() => {
    if (latencyChartRef.current) {
      latencyChart.current = echarts.init(latencyChartRef.current);
      latencyChart.current.setOption({
        title: { text: '延迟趋势', left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: '延迟 (ms)' },
        series: [
          {
            name: '平均延迟',
            type: 'line',
            data: [],
            smooth: true,
            areaStyle: { opacity: 0.3 },
          },
        ],
      });
    }

    if (throughputChartRef.current) {
      throughputChart.current = echarts.init(throughputChartRef.current);
      throughputChart.current.setOption({
        title: { text: '吞吐量趋势', left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: 'Bars/s' },
        series: [
          {
            name: '吞吐量',
            type: 'line',
            data: [],
            smooth: true,
            areaStyle: { opacity: 0.3 },
          },
        ],
      });
    }

    // 窗口大小变化时重新渲染
    const handleResize = () => {
      latencyChart.current?.resize();
      throughputChart.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      latencyChart.current?.dispose();
      throughputChart.current?.dispose();
    };
  }, []);

  // 更新图表数据
  useEffect(() => {
    if (metricsHistory.length > 0) {
      const times = metricsHistory.map((m, i) => `${i + 1}`);
      const latencies = metricsHistory.map((m) => m.avgLatency.toFixed(2));
      const throughputs = metricsHistory.map((m) => {
        const duration = m.executionTime / 1000 || 1;
        return (m.barsProcessed / duration).toFixed(2);
      });

      latencyChart.current?.setOption({
        xAxis: { data: times },
        series: [{ data: latencies }],
      });

      throughputChart.current?.setOption({
        xAxis: { data: times },
        series: [{ data: throughputs }],
      });
    }
  }, [metricsHistory]);

  return (
    <div className="execution-metrics">
      <Row gutter={[16, 16]}>
        {/* 指标卡片 */}
        <Col span={6}>
          <Card>
            <Statistic
              title="已处理Bar"
              value={metrics?.barsProcessed || 0}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均延迟"
              value={metrics?.avgLatency.toFixed(2) || 0}
              suffix="ms"
              valueStyle={{ color: (metrics?.avgLatency || 0) > 100 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="生成信号"
              value={metrics?.signalsGenerated || 0}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="下单数"
              value={metrics?.ordersPlaced || 0}
              suffix="笔"
            />
          </Card>
        </Col>

        {/* 资源使用 */}
        <Col span={12}>
          <Card title="CPU使用率">
            <Progress
              percent={Math.round(resourceStats?.cpuUsage || 0)}
              status={
                (resourceStats?.cpuUsage || 0) > 80
                  ? 'exception'
                  : (resourceStats?.cpuUsage || 0) > 60
                  ? 'normal'
                  : 'success'
              }
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="内存使用">
            <Progress
              percent={Math.round(
                ((resourceStats?.heapUsed || 0) / (resourceStats?.heapTotal || 1)) * 100,
              )}
              format={() =>
                `${resourceStats?.heapUsed.toFixed(0) || 0}MB / ${
                  resourceStats?.heapTotal.toFixed(0) || 0
                }MB`
              }
              status={
                (resourceStats?.memoryUsage || 0) > 500
                  ? 'exception'
                  : (resourceStats?.memoryUsage || 0) > 300
                  ? 'normal'
                  : 'success'
              }
            />
          </Card>
        </Col>

        {/* 图表 */}
        <Col span={12}>
          <Card>
            <div ref={latencyChartRef} style={{ width: '100%', height: '300px' }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <div ref={throughputChartRef} style={{ width: '100%', height: '300px' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

