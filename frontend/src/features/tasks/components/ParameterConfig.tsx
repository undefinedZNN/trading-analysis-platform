import React from 'react';
import { Form, InputNumber, Space, Divider, Typography } from 'antd';

const { Text, Title } = Typography;

interface ParameterConfigProps {
  form?: any;
  disabled?: boolean;
}

/**
 * 策略参数配置组件
 * 
 * 用于配置回测执行的基本参数
 */
export const ParameterConfig: React.FC<ParameterConfigProps> = ({
  form,
  disabled = false,
}) => {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div>
        <Title level={5}>资金配置</Title>
        <Form.Item
          label="初始资金"
          name="initialCapital"
          rules={[
            { required: true, message: '请输入初始资金' },
            { type: 'number', min: 1000, message: '初始资金不能少于1000' },
          ]}
          tooltip="用于回测的起始资金量"
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1000}
            max={100000000}
            step={10000}
            disabled={disabled}
            formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={value => value?.replace(/¥\s?|(,*)/g, '') as any}
            placeholder="例如: 100000"
          />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12 }}>
          建议根据实际交易规模设置，通常为 10,000 - 1,000,000 元
        </Text>
      </div>

      <Divider />

      <div>
        <Title level={5}>交易成本</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Form.Item
            label="手续费率"
            name="fee"
            rules={[
              { required: true, message: '请输入手续费率' },
              { type: 'number', min: 0, max: 0.1, message: '手续费率必须在0-10%之间' },
            ]}
            tooltip="每笔交易的手续费比例（买入和卖出各收取一次）"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={0.1}
              step={0.0001}
              precision={4}
              disabled={disabled}
              formatter={value => `${(Number(value) * 100).toFixed(4)}%`}
              parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
              placeholder="例如: 0.1%"
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            币安现货: Maker 0.1%, Taker 0.1%; OKX: Maker 0.08%, Taker 0.1%
          </Text>

          <Form.Item
            label="滑点"
            name="slippage"
            rules={[
              { required: true, message: '请输入滑点' },
              { type: 'number', min: 0, max: 0.05, message: '滑点必须在0-5%之间' },
            ]}
            tooltip="由于市场波动导致的成交价格偏差"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={0.05}
              step={0.0001}
              precision={4}
              disabled={disabled}
              formatter={value => `${(Number(value) * 100).toFixed(4)}%`}
              parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
              placeholder="例如: 0.05%"
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            建议设置为 0.05% - 0.2%，根据市场流动性调整
          </Text>
        </Space>
      </div>

      <Divider />

      <div>
        <Title level={5}>策略参数</Title>
        <Text type="secondary">
          策略特定参数将在选择策略后自动显示
        </Text>
        {/* TODO: 根据策略动态生成参数表单 */}
      </div>
    </Space>
  );
};

export default ParameterConfig;

