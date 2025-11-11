/**
 * 执行控制组件
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Form, DatePicker, InputNumber, Select, message, Spin, Divider, Typography, Alert } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, StopOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ExecutionConfig, ExecutionStatus } from '../services/executionApi';
import { ExecutionApi } from '../services/executionApi';
import { DatasetApi, type Dataset } from '../services/datasetApi';
import './ExecutionControl.less';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface ExecutionControlProps {
  strategyId: string;
  versionId: string;
  status: ExecutionStatus;
  sessionId?: string;
  parameterSchema?: any[];
  onStart?: (sessionId: string) => void;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

// 时间周期定义(分钟数)
const TIMEFRAME_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1分钟', minutes: 1 },
  { value: '5m', label: '5分钟', minutes: 5 },
  { value: '15m', label: '15分钟', minutes: 15 },
  { value: '30m', label: '30分钟', minutes: 30 },
  { value: '1h', label: '1小时', minutes: 60 },
  { value: '4h', label: '4小时', minutes: 240 },
  { value: '1d', label: '1天', minutes: 1440 },
];

export const ExecutionControl: React.FC<ExecutionControlProps> = ({
  strategyId,
  versionId,
  status,
  sessionId,
  parameterSchema = [],
  onStart,
  onStop,
  onPause,
  onResume,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(0); // 默认最快速度
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [availableTimeframes, setAvailableTimeframes] = useState<typeof TIMEFRAME_OPTIONS>([]);

  // 是否正在运行
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle' || status === 'stopped' || status === 'completed' || status === 'error';

  /**
   * 加载数据集列表(只加载active状态的)
   */
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        setDatasetsLoading(true);
        const response = await DatasetApi.getDatasets({ 
          pageSize: 100,
          status: 'active'
        });
        setDatasets(response.items || []);
      } catch (error: any) {
        console.error('Failed to load datasets:', error);
        message.error('加载数据集失败');
      } finally {
        setDatasetsLoading(false);
      }
    };

    loadDatasets();
  }, []);

  /**
   * 数据集选择变化
   */
  const handleDatasetChange = (datasetId: number) => {
    const dataset = datasets.find((d) => d.datasetId === datasetId);
    if (dataset) {
      setSelectedDataset(dataset);
      
      // 计算可用的时间周期(必须 >= granularity)
      const datasetMinutes = TIMEFRAME_MINUTES[dataset.granularity] || 1;
      const available = TIMEFRAME_OPTIONS.filter(opt => opt.minutes >= datasetMinutes);
      setAvailableTimeframes(available);
      
      // 自动选择第一个可用的时间周期
      if (available.length > 0) {
        form.setFieldsValue({
          timeframe: available[0].value,
        });
      }
      
      // 清空时间范围,让用户重新选择
      form.setFieldsValue({
        dateRange: null,
      });
    }
  };

  /**
   * 启动执行
   */
  const handleStart = async () => {
    try {
      const values = await form.validateFields();
      
      if (!selectedDataset) {
        message.error('请先选择数据集');
        return;
      }
      
      setLoading(true);

      // 构建策略参数
      const strategyParams: Record<string, any> = {};
      parameterSchema.forEach((param: any) => {
        if (values[`param_${param.name}`] !== undefined) {
          strategyParams[param.name] = values[`param_${param.name}`];
        }
      });

      const config: ExecutionConfig = {
        datasetId: selectedDataset.datasetId,
        strategyId,
        versionId,
        startTime: values.dateRange[0].toISOString(),
        endTime: values.dateRange[1].toISOString(),
        timeframe: values.timeframe,
        initialCapital: values.initialCapital,
        speed,
        enableLogging: true,
        parameters: strategyParams,
      };

      const session = await ExecutionApi.start(config);
      message.success('执行已启动');
      onStart?.(session.sessionId);
    } catch (error: any) {
      message.error(`启动失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 停止执行
   */
  const handleStop = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      await ExecutionApi.stop(sessionId);
      message.success('执行已停止');
      onStop?.();
    } catch (error: any) {
      message.error(`停止失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 暂停执行
   */
  const handlePause = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      await ExecutionApi.pause(sessionId);
      message.success('执行已暂停');
      onPause?.();
    } catch (error: any) {
      message.error(`暂停失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 恢复执行
   */
  const handleResume = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      await ExecutionApi.resume(sessionId);
      message.success('执行已恢复');
      onResume?.();
    } catch (error: any) {
      message.error(`恢复失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 渲染策略参数表单项
   */
  const renderParameterFields = () => {
    if (!parameterSchema || parameterSchema.length === 0) {
      return null;
    }

    return (
      <>
        <Divider>策略参数</Divider>
        {parameterSchema.map((param: any) => {
          const fieldName = `param_${param.name}`;
          
          // 根据参数类型渲染不同的表单控件
          if (param.type === 'number') {
            return (
              <Form.Item
                key={fieldName}
                label={param.title || param.name}
                name={fieldName}
                initialValue={param.default}
                rules={[
                  { required: param.required, message: `请输入${param.title || param.name}` },
                ]}
                tooltip={param.description}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={param.minimum}
                  max={param.maximum}
                  step={param.step || 1}
                />
              </Form.Item>
            );
          } else if (param.type === 'boolean') {
            return (
              <Form.Item
                key={fieldName}
                label={param.title || param.name}
                name={fieldName}
                initialValue={param.default}
                valuePropName="checked"
                tooltip={param.description}
              >
                <Select>
                  <Select.Option value={true}>是</Select.Option>
                  <Select.Option value={false}>否</Select.Option>
                </Select>
              </Form.Item>
            );
          } else if (param.enum) {
            return (
              <Form.Item
                key={fieldName}
                label={param.title || param.name}
                name={fieldName}
                initialValue={param.default}
                rules={[
                  { required: param.required, message: `请选择${param.title || param.name}` },
                ]}
                tooltip={param.description}
              >
                <Select>
                  {param.enum.map((option: any) => (
                    <Select.Option key={option} value={option}>
                      {option}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            );
          } else {
            // 默认文本输入
            return (
              <Form.Item
                key={fieldName}
                label={param.title || param.name}
                name={fieldName}
                initialValue={param.default}
                rules={[
                  { required: param.required, message: `请输入${param.title || param.name}` },
                ]}
                tooltip={param.description}
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            );
          }
        })}
      </>
    );
  };

  // 时间范围禁用日期
  const disabledDate = (current: dayjs.Dayjs) => {
    if (!selectedDataset) return false;
    
    const start = dayjs(selectedDataset.timeStart);
    const end = dayjs(selectedDataset.timeEnd);
    
    return current && (current.isBefore(start, 'day') || current.isAfter(end, 'day'));
  };

  return (
    <Card title="执行控制" className="execution-control">
      <Spin spinning={datasetsLoading}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            initialCapital: 100000,
          }}
        >
          {/* 数据集选择 */}
          <Form.Item
            label="选择数据集"
            name="datasetId"
            rules={[{ required: true, message: '请选择数据集' }]}
            tooltip="选择已导入的数据集进行回测"
          >
            <Select
              placeholder="请选择数据集"
              onChange={handleDatasetChange}
              showSearch
              optionFilterProp="children"
              loading={datasetsLoading}
            >
              {datasets.map((dataset) => (
                <Select.Option key={dataset.datasetId} value={dataset.datasetId}>
                  {dataset.tradingPair} - {dataset.granularity} ({new Date(dataset.timeStart).toLocaleDateString()} ~ {new Date(dataset.timeEnd).toLocaleDateString()})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {selectedDataset && (
            <Alert
              message="数据集信息"
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text><strong>交易对:</strong> {selectedDataset.tradingPair}</Text>
                  <Text><strong>数据颗粒度:</strong> {selectedDataset.granularity}</Text>
                  <Text><strong>数据范围:</strong> {new Date(selectedDataset.timeStart).toLocaleString()} ~ {new Date(selectedDataset.timeEnd).toLocaleString()}</Text>
                  <Text><strong>记录数:</strong> {selectedDataset.rowCount.toLocaleString()}</Text>
                </Space>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Divider>回测配置</Divider>

          <Form.Item
            label="回测时间范围"
            name="dateRange"
            rules={[{ required: true, message: '请选择时间范围' }]}
            tooltip="选择回测的起止时间,必须在数据集范围内"
          >
            <RangePicker 
              style={{ width: '100%' }} 
              showTime 
              disabled={!selectedDataset}
              disabledDate={disabledDate}
            />
          </Form.Item>

          <Form.Item
            label="回测时间周期"
            name="timeframe"
            rules={[{ required: true, message: '请选择时间周期' }]}
            tooltip={selectedDataset ? `必须 >= 数据集颗粒度 (${selectedDataset.granularity})` : '请先选择数据集'}
          >
            <Select disabled={!selectedDataset || availableTimeframes.length === 0}>
              {availableTimeframes.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="初始资金"
            name="initialCapital"
            rules={[{ required: true, message: '请输入初始资金' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1000}
              max={10000000}
              formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
            />
          </Form.Item>

          <Form.Item label="回放速度">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Button 
                  type={speed === 0 ? 'primary' : 'default'}
                  onClick={() => setSpeed(0)}
                  disabled={!isIdle}
                >
                  ⚡ 最快
                </Button>
                <Button 
                  type={speed === 1 ? 'primary' : 'default'}
                  onClick={() => setSpeed(1)}
                  disabled={!isIdle}
                >
                  标准 (1x)
                </Button>
                <Button 
                  type={speed === 0.5 ? 'primary' : 'default'}
                  onClick={() => setSpeed(0.5)}
                  disabled={!isIdle}
                >
                  慢速 (0.5x)
                </Button>
              </Space>
              
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {speed === 0 && '⚡ 最快速度 - 无延迟推送,适合生产回测'}
                {speed === 1 && '标准速度 - 每秒1根K线,适合观察'}
                {speed === 0.5 && '慢速模式 - 每2秒1根K线,适合调试'}
                {speed !== 0 && speed !== 1 && speed !== 0.5 && `${speed}x 速度`}
              </Text>
            </Space>
          </Form.Item>

          {/* 动态渲染策略参数 */}
          {renderParameterFields()}
        </Form>
      </Spin>

      <Space style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
        {isIdle && (
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            loading={loading}
            onClick={handleStart}
            disabled={!selectedDataset}
          >
            启动
          </Button>
        )}

        {isRunning && (
          <>
            <Button
              size="large"
              icon={<PauseCircleOutlined />}
              loading={loading}
              onClick={handlePause}
            >
              暂停
            </Button>
            <Button
              danger
              size="large"
              icon={<StopOutlined />}
              loading={loading}
              onClick={handleStop}
            >
              停止
            </Button>
          </>
        )}

        {isPaused && (
          <>
            <Button
              type="primary"
              size="large"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={handleResume}
            >
              恢复
            </Button>
            <Button
              danger
              size="large"
              icon={<StopOutlined />}
              loading={loading}
              onClick={handleStop}
            >
              停止
            </Button>
          </>
        )}
      </Space>
    </Card>
  );
};
