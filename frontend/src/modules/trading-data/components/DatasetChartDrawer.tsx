import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Space, Select, DatePicker, Spin, Typography, Empty, message, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { createChart, ColorType } from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
} from 'lightweight-charts';
import type {
  DatasetDto,
  DatasetCandlesResponse,
} from '../../../shared/api/tradingData';
import { fetchDatasetCandles } from '../../../shared/api/tradingData';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const DEFAULT_LIMIT = 500;

const RESOLUTION_PIPELINE = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];

function parseGranularityToSeconds(granularity: string): number | null {
  const match = granularity.trim().toLowerCase().match(/^(\d+)([smhd])$/);
  if (!match) {
    return null;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const unitMap: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  const unitSeconds = unitMap[unit];
  if (!unitSeconds) {
    return null;
  }
  return value * unitSeconds;
}

function buildResolutionOptions(baseGranularity: string): string[] {
  const baseSeconds = parseGranularityToSeconds(baseGranularity);
  if (!baseSeconds) {
    return [baseGranularity];
  }
  const candidates = RESOLUTION_PIPELINE.filter((item) => {
    const seconds = parseGranularityToSeconds(item);
    return seconds !== null && seconds >= baseSeconds && seconds % baseSeconds === 0;
  });
  if (!candidates.includes(baseGranularity)) {
    candidates.unshift(baseGranularity);
  }
  return Array.from(new Set(candidates));
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function toUtcTimestamp(seconds: number): UTCTimestamp {
  return seconds as UTCTimestamp;
}

type DatasetChartDrawerProps = {
  open: boolean;
  dataset: DatasetDto | null;
  onClose: () => void;
};

export default function DatasetChartDrawer({ open, dataset, onClose }: DatasetChartDrawerProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [chartHeight, setChartHeight] = useState(() => Math.floor(window.innerHeight * 0.8));

  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<DatasetCandlesResponse | null>(null);
  const [showVolume, setShowVolume] = useState(true);

  const resolutionOptions = useMemo(() => {
    if (!dataset) return [];
    return buildResolutionOptions(dataset.granularity);
  }, [dataset]);

  const datasetStart = useMemo(() => (dataset ? dayjs(dataset.timeStart) : null), [dataset]);
  const datasetEnd = useMemo(() => (dataset ? dayjs(dataset.timeEnd) : null), [dataset]);
  const disabledDate = useCallback(
    (current: Dayjs) => {
      if (!current) return false;
      if (datasetStart && current.isBefore(datasetStart, 'second')) {
        return true;
      }
      if (datasetEnd && current.isAfter(datasetEnd, 'second')) {
        return true;
      }
      return false;
    },
    [datasetStart, datasetEnd],
  );

  useEffect(() => {
    if (open && dataset) {
      setResolution(dataset.granularity);
      if (datasetStart && datasetEnd) {
        const oneWeekAgo = datasetEnd.subtract(7, 'day');
        const latestRangeStart = oneWeekAgo.isAfter(datasetStart) ? oneWeekAgo : datasetStart;
        setRange([latestRangeStart, datasetEnd]);
      }
    } else if (!open) {
      setResponse(null);
      setRange(null);
      setResolution(undefined);
    }
  }, [open, dataset, datasetStart, datasetEnd]);

  const renderChart = useCallback(() => {
    if (!chartContainerRef.current) {
      return;
    }
    if (chartRef.current) {
      return;
    }
    const nextHeight = Math.floor(window.innerHeight * 0.8);
    setChartHeight(nextHeight);
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: nextHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333333',
      },
      grid: {
        vertLines: { color: '#eeeeee' },
        horzLines: { color: '#eeeeee' },
      },
      rightPriceScale: {
        borderColor: '#cccccc',
      },
      timeScale: {
        borderColor: '#cccccc',
      },
      crosshair: {
        mode: 0,
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

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: '#6c5ce7',
      base: 0,
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      const resizedHeight = Math.floor(window.innerHeight * 0.8);
      setChartHeight(resizedHeight);
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: resizedHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (open) {
      const cleanup = renderChart();
      return cleanup;
    }
    return undefined;
  }, [open, renderChart]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }
  }, [showVolume]);

  const updateSeriesData = useCallback((candles: DatasetCandlesResponse['candles']) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map((item) => ({
      time: toUtcTimestamp(item.time),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    const volumeData: HistogramData<UTCTimestamp>[] = candles.map((item) => ({
      time: toUtcTimestamp(item.time),
      value: item.volume,
      color: item.close >= item.open ? '#26a69a' : '#ef5350',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, []);

  const loadCandles = useCallback(async () => {
    if (!dataset) {
      return;
    }
    const currentResolution = resolution ?? dataset.granularity;

    setLoading(true);
    try {
    const params: Record<string, number | string> = {
      resolution: currentResolution,
      limit: DEFAULT_LIMIT,
    };
    if (range && range[0] && range[1]) {
      params.from = toUnixSeconds(range[0].toDate());
      params.to = toUnixSeconds(range[1].toDate());
      }

      const result = await fetchDatasetCandles(dataset.datasetId, params);
      setResponse(result);
      updateSeriesData(result.candles);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch (error) {
      console.error(error);
      message.error('加载 K 线数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [dataset, resolution, range, updateSeriesData]);

  useEffect(() => {
    if (open && dataset && resolution) {
      void loadCandles();
    }
  }, [open, dataset, resolution, loadCandles]);

  const onRangeChange = (value: [Dayjs | null, Dayjs | null] | null) => {
    setRange(value);
  };

  const candles = response?.candles ?? [];

  return (
    <Drawer
      width="85%"
      bodyStyle={{ paddingBottom: 24 }}
      title={dataset ? `数据集 #${dataset.datasetId} · ${dataset.tradingPair}` : '数据集图表'}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {!dataset ? (
        <Empty description="未选择数据集" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              style={{ width: 140 }}
              value={resolution ?? dataset.granularity}
              onChange={(value) => setResolution(value)}
              options={resolutionOptions.map((item) => ({ label: item, value: item }))}
            />
            <RangePicker
              showTime
              allowClear
              disabledDate={disabledDate}
              value={range ?? undefined}
              onChange={onRangeChange}
            />
            <Space align="center">
              <Text type="secondary">成交量</Text>
              <Switch
                checked={showVolume}
                onChange={(checked) => setShowVolume(checked)}
                checkedChildren="显示"
                unCheckedChildren="隐藏"
              />
            </Space>
            <Text type="secondary">
              当前时间范围：
              {response ? `${new Date(response.from * 1000).toLocaleString()} ~ ${new Date(response.to * 1000).toLocaleString()}` : '自动'}
            </Text>
          </Space>

          <div style={{ position: 'relative' }}>
            {loading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                  background: 'rgba(255,255,255,0.6)',
                }}
              >
                <Spin />
              </div>
            )}
            <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight }} />
          </div>

          {candles.length === 0 && !loading && (
            <Text type="secondary">暂无可用的 K 线数据。</Text>
          )}
        </Space>
      )}
    </Drawer>
  );
}
