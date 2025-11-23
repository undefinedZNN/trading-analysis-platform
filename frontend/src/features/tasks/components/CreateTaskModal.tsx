import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, InputNumber, Button, Space, message } from 'antd';
import { apiClient } from '../../../api/client';
import type { CreateBacktestTaskDto } from '../../../api/types/task';

interface CreateTaskModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

interface Strategy {
  strategyId: string;
  name: string;
  description?: string;
  scriptVersions: Array<{
    scriptVersionId: string;
    versionName: string;
    isMaster: boolean;
  }>;
}

interface Dataset {
  datasetId: string;
  tradingPair: string;
  timeframe: string;
  startDate: string;
  endDate: string;
}

/**
 * 创建回测任务模态框
 */
export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  open,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // 加载策略列表
  useEffect(() => {
    if (open) {
      loadStrategies();
      loadDatasets();
    }
  }, [open]);

  const loadStrategies = async () => {
    setLoadingStrategies(true);
    try {
      const response = await apiClient.strategies.list();
      setStrategies(response.data || []);
    } catch (error) {
      message.error('加载策略列表失败');
      console.error('Failed to load strategies:', error);
    } finally {
      setLoadingStrategies(false);
    }
  };

  const loadDatasets = async () => {
    setLoadingDatasets(true);
    try {
      // TODO: 实现数据集API
      // const response = await apiClient.datasets.list();
      // setDatasets(response.data || []);
      
      // Mock数据
      setDatasets([
        {
          datasetId: 'dataset-1',
          tradingPair: 'BTC/USDT',
          timeframe: '1h',
          startDate: '2024-01-01',
          endDate: '2024-03-31',
        },
        {
          datasetId: 'dataset-2',
          tradingPair: 'ETH/USDT',
          timeframe: '1h',
          startDate: '2024-01-01',
          endDate: '2024-03-31',
        },
      ]);
    } catch (error) {
      message.error('加载数据集列表失败');
      console.error('Failed to load datasets:', error);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const handleStrategyChange = (strategyId: string) => {
    const strategy = strategies.find(s => s.strategyId === strategyId);
    setSelectedStrategy(strategy || null);
    // 清空版本选择
    form.setFieldValue('scriptVersionId', undefined);
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const taskData: CreateBacktestTaskDto = {
        strategyId: values.strategyId,
        scriptVersionId: values.scriptVersionId,
        datasetId: values.datasetId,
        taskName: values.taskName,
        description: values.description,
        executionConfig: {
          initialCapital: values.initialCapital || 100000,
          fee: values.fee || 0.001,
          slippage: values.slippage || 0.0005,
          params: values.params || {},
        },
      };

      await apiClient.tasks.create(taskData);
      message.success('任务创建成功');
      form.resetFields();
      setSelectedStrategy(null);
      onSuccess();
    } catch (error: any) {
      message.error(error.message || '创建任务失败');
      console.error('Failed to create task:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedStrategy(null);
    onCancel();
  };

  return (
    <Modal
      title="创建回测任务"
      open={open}
      onCancel={handleCancel}
      width={700}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          initialCapital: 100000,
          fee: 0.001,
          slippage: 0.0005,
        }}
      >
        <Form.Item
          label="任务名称"
          name="taskName"
          rules={[{ required: true, message: '请输入任务名称' }]}
        >
          <Input placeholder="例如: BTC均线策略回测" />
        </Form.Item>

        <Form.Item
          label="任务描述"
          name="description"
        >
          <Input.TextArea
            rows={2}
            placeholder="选填：简要描述此次回测的目的"
          />
        </Form.Item>

        <Form.Item
          label="选择策略"
          name="strategyId"
          rules={[{ required: true, message: '请选择策略' }]}
        >
          <Select
            placeholder="请选择策略"
            loading={loadingStrategies}
            onChange={handleStrategyChange}
            showSearch
            optionFilterProp="children"
          >
            {strategies.map(strategy => (
              <Select.Option key={strategy.strategyId} value={strategy.strategyId}>
                {strategy.name}
                {strategy.description && (
                  <span style={{ color: '#999', marginLeft: 8 }}>
                    - {strategy.description}
                  </span>
                )}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {selectedStrategy && (
          <Form.Item
            label="策略版本"
            name="scriptVersionId"
            rules={[{ required: true, message: '请选择策略版本' }]}
          >
            <Select placeholder="请选择策略版本">
              {selectedStrategy.scriptVersions.map(version => (
                <Select.Option
                  key={version.scriptVersionId}
                  value={version.scriptVersionId}
                >
                  {version.versionName}
                  {version.isMaster && (
                    <span style={{ color: '#52c41a', marginLeft: 8 }}>
                      (主版本)
                    </span>
                  )}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Form.Item
          label="数据集"
          name="datasetId"
          rules={[{ required: true, message: '请选择数据集' }]}
        >
          <Select
            placeholder="请选择数据集"
            loading={loadingDatasets}
            showSearch
            optionFilterProp="children"
          >
            {datasets.map(dataset => (
              <Select.Option key={dataset.datasetId} value={dataset.datasetId}>
                {dataset.tradingPair} - {dataset.timeframe}
                <span style={{ color: '#999', marginLeft: 8 }}>
                  ({dataset.startDate} 至 {dataset.endDate})
                </span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="回测配置">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item
              label="初始资金"
              name="initialCapital"
              noStyle
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1000}
                max={10000000}
                step={10000}
                formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value?.replace(/¥\s?|(,*)/g, '') as any}
              />
            </Form.Item>

            <Space style={{ width: '100%' }}>
              <Form.Item
                label="手续费率"
                name="fee"
                noStyle
              >
                <InputNumber
                  min={0}
                  max={0.1}
                  step={0.0001}
                  formatter={value => `${(Number(value) * 100).toFixed(2)}%`}
                  parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
                />
              </Form.Item>

              <Form.Item
                label="滑点"
                name="slippage"
                noStyle
              >
                <InputNumber
                  min={0}
                  max={0.01}
                  step={0.0001}
                  formatter={value => `${(Number(value) * 100).toFixed(2)}%`}
                  parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
                />
              </Form.Item>
            </Space>
          </Space>
        </Form.Item>

        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleCancel}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              创建任务
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

