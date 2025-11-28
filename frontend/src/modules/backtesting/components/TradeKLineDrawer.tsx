import { useEffect, useRef, useState, useCallback } from 'react';
import { Drawer, Spin, Alert, Space, Typography, Tag } from 'antd';
import dayjs from 'dayjs';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, SeriesMarker } from 'lightweight-charts';
import type { BacktestTask, TaskTradeRecord, TaskBarsResponse } from '../../../shared/api/backtestTasks';
import { fetchTaskBars } from '../../../shared/api/backtestTasks';

const { Text } = Typography;

interface TradeKLineDrawerProps {
  task: BacktestTask;
  trade: TaskTradeRecord | null;
  open: boolean;
  onClose: () => void;
}

const DEFAULT_BEFORE = 100;
const DEFAULT_AFTER = 50;

export function TradeKLineDrawer({ task, trade, open, onClose }: TradeKLineDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<TaskBarsResponse | null>(null);

  const destroyChart = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
  }, []);

  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) {
      return;
    }
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: '#fff' },
        textColor: '#1f1f1f',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#d9d9d9' },
      timeScale: {
        borderColor: '#d9d9d9',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
  }, []);

  useEffect(() => {
    if (!open) {
      setBars(null);
      setError(null);
      destroyChart();
      return;
    }
    if (!trade) {
      setError('请选择需要查看的交易');
      return;
    }
    const entryRef =
      trade.context?.entryBarTimestamp ?? trade.entryTimestamp ?? trade.barTimestamp;
    const timestampSource = entryRef || trade.timestamp;
    if (!timestampSource) {
      setError('该交易缺少时间戳，无法定位K线');
      return;
    }
    const timestampSec = dayjs(timestampSource).unix();
    if (!Number.isFinite(timestampSec)) {
      setError('无法解析交易时间');
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);
    const resolution =
      task.resultSummary?.datasetBaseGranularity || task.dataConfig.timeframe || '1m';
    fetchTaskBars(task.taskId, {
      timestampSec,
      resolution,
      beforeBars: DEFAULT_BEFORE,
      afterBars: DEFAULT_AFTER,
    })
      .then((response) => {
        if (!mounted) return;
        setBars(response);
        initChart();
        if (chartRef.current && candleSeriesRef.current) {
          const data: CandlestickData[] = response.candles.map((bar) => ({
            time: bar.time as UTCTimestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }));
          candleSeriesRef.current.setData(data);
          const markers = buildMarkers(trade);
          candleSeriesRef.current.setMarkers(markers);
        }
      })
      .catch((err) => {
        console.error('[TradeKLineDrawer] 加载K线失败', err);
        if (mounted) {
          setError(err?.message || '加载K线失败');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [open, trade, task.taskId, task.dataConfig.timeframe, initChart, destroyChart]);

  useEffect(() => {
    if (!open || !bars) {
      return;
    }
    if (!chartRef.current) {
      initChart();
    }
    if (chartRef.current && candleSeriesRef.current && bars.candles.length > 0) {
      const data: CandlestickData[] = bars.candles.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));
      candleSeriesRef.current.setData(data);
      if (trade) {
        const markers = buildMarkers(trade);
        candleSeriesRef.current.setMarkers(markers);
      }
    }
  }, [open, bars, initChart, trade]);

  const content = () => {
    if (!trade) {
      return <Alert type="info" message="请选择一笔交易" />;
    }
    if (error) {
      return <Alert type="error" message={error} />;
    }
    if (loading || !bars) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 420 }}>
          <Spin />
        </div>
      );
    }
    return <div ref={containerRef} style={{ width: '100%', height: 420 }} />;
};

function buildMarkers(trade: TaskTradeRecord): SeriesMarker<UTCTimestamp>[] {
  const markers: SeriesMarker<UTCTimestamp>[] = [];

  const formatPrice = (value?: number | null) =>
    value !== undefined && value !== null ? value.toFixed(2) : undefined;

  const pushMarker = (
    timeSource: string | null | undefined,
    position: 'aboveBar' | 'belowBar',
    color: string,
    text?: string,
  ) => {
    if (!timeSource) return;
    const epoch = dayjs(timeSource).unix();
    if (!Number.isFinite(epoch)) return;
    const marker: SeriesMarker<UTCTimestamp> = {
      time: epoch as UTCTimestamp,
      position,
      color,
      shape: position === 'belowBar' ? 'arrowUp' : 'arrowDown',
      text,
    };
    markers.push(marker);
  };

  const entryTime = trade.context?.entryBarTimestamp ?? trade.entryTimestamp ?? trade.barTimestamp;
  pushMarker(
    entryTime,
    trade.side === 'buy' ? 'belowBar' : 'aboveBar',
    '#1890ff',
    `入场 ${formatPrice(trade.entryPrice) ?? ''}`,
  );

  // ✅ 修复：出场时间不应该使用 barTimestamp（那是入场时间）
  const exitTime = trade.exitTimestamp || trade.timestamp;
  pushMarker(
    exitTime,
    trade.side === 'buy' ? 'aboveBar' : 'belowBar',
    '#fa8c16',
    `平仓 ${formatPrice(trade.exitPrice) ?? ''}`,
  );

  if (trade.stopPrice !== undefined && trade.stopPrice !== null) {
    pushMarker(
      entryTime,
      trade.side === 'buy' ? 'belowBar' : 'aboveBar',
      '#ff4d4f',
      `止损 ${trade.stopPrice.toFixed(2)}`,
    );
  }

  if (trade.targetPrice !== undefined && trade.targetPrice !== null) {
    pushMarker(
      entryTime,
      trade.side === 'buy' ? 'aboveBar' : 'belowBar',
      '#52c41a',
      `止盈 ${trade.targetPrice.toFixed(2)}`,
    );
  }

  if (trade.exitSegments && trade.exitSegments.length > 1) {
    trade.exitSegments.forEach((segment, index) => {
      pushMarker(
        segment.barTimestamp ?? segment.timestamp,
        trade.side === 'buy' ? 'aboveBar' : 'belowBar',
        '#722ed1',
        `减仓${index + 1} ${formatPrice(segment.price) ?? ''}`,
      );
    });
  }

  return markers;
}

  return (
    <Drawer
      title={
        <Space direction="vertical" size={4}>
          <Text strong>
            交易K线 - {trade?.symbol || task.strategyId}
          </Text>
          {trade && (
            <Space size={8}>
              <Tag color={trade.side === 'buy' ? 'green' : 'red'}>
                {trade.side === 'buy' ? '买入' : '卖出'}
              </Tag>
              <Tag color={trade.type === 'open' ? 'blue' : 'orange'}>
                {trade.type === 'open' ? '开仓' : '平仓'}
              </Tag>
              {trade.reason && <Tag color="purple">{trade.reason}</Tag>}
            </Space>
          )}
        </Space>
      }
      open={open}
      width="60%"
      destroyOnClose
      onClose={() => {
        destroyChart();
        onClose();
      }}
      bodyStyle={{ padding: 0 }}
    >
      {content()}
      {trade && (
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <Space size={24}>
            <Text>Entry: {trade.entryPrice ?? trade.price ?? '-'} </Text>
            <Text>Exit: {trade.exitPrice ?? '-'} </Text>
            <Text>Stop: {trade.stopPrice ?? '-'} </Text>
            <Text>Target: {trade.targetPrice ?? '-'} </Text>
          </Space>
        </div>
      )}
    </Drawer>
  );
}
