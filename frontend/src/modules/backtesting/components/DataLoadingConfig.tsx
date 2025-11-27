import React, { useState } from 'react';
import { Card, Radio, Slider, Alert, Tooltip, Space, Divider, Tag } from 'antd';
import { InfoCircleOutlined, ThunderboltOutlined, DatabaseOutlined, ClockCircleOutlined } from '@ant-design/icons';

export type DataLoadMode = 'default' | 'optimized' | 'streaming' | 'hybrid' | 'segmented';

export interface DataLoadConfig {
  mode: DataLoadMode;
  exactbars: boolean;
  preload: boolean;
  runonce: boolean;
  chunkSize?: number;
  segmentMonths?: number;
  precision?: 'full' | 'reduced';
}

interface DataLoadingConfigProps {
  value?: DataLoadConfig;
  onChange?: (config: DataLoadConfig) => void;
  datasetSize?: number; // 数据集大小（行数）
}

export const DataLoadingConfig: React.FC<DataLoadingConfigProps> = ({
  value = {
    mode: 'default',
    exactbars: false,
    preload: true,
    runonce: true,
  },
  onChange,
  datasetSize = 0,
}) => {
  const [mode, setMode] = useState<DataLoadMode>(value.mode);

  // 预估内存和时间
  const estimates = React.useMemo(() => {
    const baseMemory = (datasetSize * 500) / (1024 * 1024 * 1024); // GB
    const baseTime = Math.max(10, datasetSize / 50000); // 秒

    switch (mode) {
      case 'default':
        return {
          memory: baseMemory,
          time: baseTime,
          speed: 100,
          accuracy: 100,
        };
      case 'optimized':
        return {
          memory: baseMemory * 0.12, // 降低88%
          time: baseTime,
          speed: 75, // 慢25%
          accuracy: 100,
        };
      case 'streaming':
        return {
          memory: baseMemory * 0.06, // 降低94%
          time: baseTime * 0.1, // 启动快
          speed: 70,
          accuracy: 100,
        };
      case 'hybrid':
        return {
          memory: baseMemory * 0.02, // 开发模式
          time: baseTime * 0.02,
          speed: 100,
          accuracy: 85, // 开发模式精度
        };
      case 'segmented':
        return {
          memory: baseMemory * 0.3, // 单段
          time: baseTime * 0.3,
          speed: 90,
          accuracy: 95,
        };
      default:
        return { memory: baseMemory, time: baseTime, speed: 100, accuracy: 100 };
    }
  }, [mode, datasetSize]);

  const handleModeChange = (newMode: DataLoadMode) => {
    setMode(newMode);

    let config: DataLoadConfig = {
      mode: newMode,
      exactbars: false,
      preload: true,
      runonce: true,
    };

    switch (newMode) {
      case 'optimized':
        config = {
          mode: 'optimized',
          exactbars: true,
          preload: false,
          runonce: false,
        };
        break;
      case 'streaming':
        config = {
          mode: 'streaming',
          exactbars: true,
          preload: false,
          runonce: false,
          chunkSize: 100000,
        };
        break;
      case 'hybrid':
        config = {
          mode: 'hybrid',
          exactbars: false,
          preload: true,
          runonce: true,
          precision: 'reduced',
        };
        break;
      case 'segmented':
        config = {
          mode: 'segmented',
          exactbars: true,
          preload: false,
          runonce: false,
          segmentMonths: 3,
        };
        break;
    }

    onChange?.(config);
  };

  const formatMemory = (gb: number) => {
    if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
    return `${gb.toFixed(2)} GB`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)} 秒`;
    return `${(seconds / 60).toFixed(1)} 分钟`;
  };

  return (
    <Card title="数据加载策略配置" bordered={false}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 模式选择 */}
        <div>
          <Radio.Group value={mode} onChange={(e) => handleModeChange(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {/* 默认模式 */}
              <Radio value="default">
                <Space>
                  <span>默认模式</span>
                  <Tag color="blue">简单</Tag>
                  <Tooltip title="标准Backtrader配置，适合小数据集">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Radio>

              {/* 内存优化模式 - 推荐 */}
              <Radio value="optimized">
                <Space>
                  <span>内存优化模式</span>
                  <Tag color="green">推荐</Tag>
                  <Tag color="gold">
                    <ThunderboltOutlined /> 最佳性价比
                  </Tag>
                  <Tooltip title="启用exactbars，内存降低85%+，仅需1行代码">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Radio>

              {/* 流式加载 */}
              <Radio value="streaming">
                <Space>
                  <span>流式加载模式</span>
                  <Tag color="purple">高级</Tag>
                  <Tag>内存最优</Tag>
                  <Tooltip title="DuckDB流式查询+Backtrader优化，适合千万级数据">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Radio>

              {/* 混合精度 */}
              <Radio value="hybrid">
                <Space>
                  <span>混合精度模式</span>
                  <Tag color="cyan">开发友好</Tag>
                  <Tooltip title="开发时用低精度数据，生产时用完整数据">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Radio>

              {/* 智能分段 */}
              <Radio value="segmented">
                <Space>
                  <span>智能分段模式</span>
                  <Tag>长周期</Tag>
                  <Tooltip title="按时间窗口分段处理，适合多年回测">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        <Divider />

        {/* 性能预估 */}
        <Card size="small" title="性能预估" type="inner">
          <Space direction="vertical" style={{ width: '100%' }}>
            {/* 内存占用 */}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <DatabaseOutlined />
                  <span>内存占用:</span>
                </Space>
                <strong style={{ color: estimates.memory < 1 ? '#52c41a' : '#faad14' }}>
                  {formatMemory(estimates.memory)}
                </strong>
              </Space>
              <Slider
                min={0}
                max={datasetSize * 500 / (1024 * 1024 * 1024)}
                value={estimates.memory}
                disabled
                tooltip={{ formatter: (val) => formatMemory(val || 0) }}
              />
            </div>

            {/* 加载时间 */}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <ClockCircleOutlined />
                  <span>加载时间:</span>
                </Space>
                <strong style={{ color: estimates.time < 30 ? '#52c41a' : '#faad14' }}>
                  {formatTime(estimates.time)}
                </strong>
              </Space>
            </div>

            {/* 运行速度 */}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <ThunderboltOutlined />
                  <span>运行速度:</span>
                </Space>
                <strong>{estimates.speed}%</strong>
              </Space>
              <Slider
                min={0}
                max={100}
                value={estimates.speed}
                disabled
                marks={{
                  0: '慢',
                  100: '快',
                }}
              />
            </div>

            {/* 准确性 */}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <span>准确性:</span>
                </Space>
                <strong style={{ color: estimates.accuracy === 100 ? '#52c41a' : '#faad14' }}>
                  {estimates.accuracy}%
                </strong>
              </Space>
            </div>
          </Space>
        </Card>

        {/* 警告提示 */}
        {mode === 'default' && datasetSize > 1000000 && (
          <Alert
            message="数据量较大，建议使用内存优化模式"
            description="当前数据集包含超过100万条记录，默认模式可能导致内存不足。推荐切换到内存优化模式。"
            type="warning"
            showIcon
          />
        )}

        {mode === 'hybrid' && (
          <Alert
            message="开发模式准确性说明"
            description="混合精度模式在开发时使用降采样数据，结果可能与生产环境有5-15%差异。请在正式回测前切换到完整模式。"
            type="info"
            showIcon
          />
        )}

        {mode === 'optimized' && (
          <Alert
            message="推荐使用此模式"
            description="内存优化模式是大多数场景的最佳选择：内存降低85%+，速度仅慢20-30%，无需代码改动。"
            type="success"
            showIcon
          />
        )}
      </Space>
    </Card>
  );
};

