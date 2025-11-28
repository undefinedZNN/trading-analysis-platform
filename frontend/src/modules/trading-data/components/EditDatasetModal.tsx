import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Typography, message, Select, InputNumber, Card } from 'antd';
import type { DatasetDto } from '../../../shared/api/tradingData';
import { updateDataset } from '../../../shared/api/tradingData';
import TagInput from './TagInput';
import { RECOMMENDED_DATASET_TAGS } from '../../../shared/constants/tradingData';
import { AssetType, ASSET_TYPE_OPTIONS } from '../../../shared/types/asset-types';

const { TextArea } = Input;
const { Paragraph } = Typography;

type EditDatasetModalProps = {
  open: boolean;
  dataset: DatasetDto | null;
  onCancel: () => void;
  onUpdated?: (dataset: DatasetDto) => void;
};

export default function EditDatasetModal({
  open,
  dataset,
  onCancel,
  onUpdated,
}: EditDatasetModalProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<string | undefined>(undefined);

  const initialLabels = useMemo(() => dataset?.labels ?? [], [dataset]);

  useEffect(() => {
    if (open && dataset) {
      setSelectedAssetType(dataset.assetType);
      form.setFieldsValue({
        description: dataset.description ?? '',
        labels: initialLabels,
        updatedBy: '',
        assetType: dataset.assetType,
        contractSpecs: dataset.contractSpecs || {},
      });
    } else {
      form.resetFields();
      setSelectedAssetType(undefined);
    }
  }, [open, dataset, form, initialLabels]);

  if (!dataset) {
    return null;
  }

  const handleSubmit = async (values: any) => {
    const payload = {
      description: values.description?.trim() ? values.description.trim() : null,
      labels: Array.isArray(values.labels) ? values.labels : [],
      updatedBy: values.updatedBy?.trim() || undefined,
      assetType: values.assetType || null,
      contractSpecs: values.contractSpecs || null,
    };

    setSubmitting(true);
    try {
      const updated = await updateDataset(dataset.datasetId, payload);
      message.success('数据集已更新');
      onUpdated?.(updated);
      onCancel();
    } catch (error) {
      console.error(error);
      message.error('更新数据集失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`编辑数据集 #${dataset.datasetId}`}
      okText="保存"
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        数据范围：{new Date(dataset.timeStart).toLocaleString()} ~{' '}
        {new Date(dataset.timeEnd).toLocaleString()}
      </Paragraph>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="资产类型"
          name="assetType"
          rules={[{ required: true, message: '请选择资产类型' }]}
        >
          <Select
            placeholder="请选择资产类型"
            onChange={(value) => setSelectedAssetType(value)}
            options={ASSET_TYPE_OPTIONS}
          />
        </Form.Item>

        {/* 合约规格（动态显示） */}
        {selectedAssetType === AssetType.Futures && (
          <Card title="合约规格 (期货)" size="small" style={{ marginBottom: 16 }}>
            <Form.Item
              label="合约乘数"
              name={['contractSpecs', 'multiplier']}
              rules={[{ required: true, message: '请输入合约乘数' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} placeholder="例如：10" />
            </Form.Item>
            <Form.Item
              label="保证金比例"
              name={['contractSpecs', 'marginRatio']}
              rules={[{ required: true, message: '请输入保证金比例' }]}
            >
              <InputNumber
                min={0}
                max={1}
                step={0.01}
                style={{ width: '100%' }}
                placeholder="例如：0.09 (9%)"
                formatter={(value) => (value ? `${(Number(value) * 100).toFixed(1)}%` : '')}
                parser={(value) => (value ? Number(value.replace('%', '')) / 100 : 0) as number}
              />
            </Form.Item>
            <Form.Item label="最小变动价位" name={['contractSpecs', 'tickSize']}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="例如：1.0" />
            </Form.Item>
          </Card>
        )}

        {selectedAssetType === AssetType.Stock && (
          <Card title="合约规格 (股票)" size="small" style={{ marginBottom: 16 }}>
            <Form.Item
              label="最小交易单位"
              name={['contractSpecs', 'lotSize']}
              rules={[{ required: true, message: '请输入最小交易单位' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} placeholder="例如：100 (股)" />
            </Form.Item>
          </Card>
        )}

        <Form.Item label="标签" name="labels">
          <TagInput
            placeholder="输入或选择标签"
            suggestions={Array.from(RECOMMENDED_DATASET_TAGS)}
            allowClear
          />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <TextArea rows={3} placeholder="例如：数据来源说明或使用备注" />
        </Form.Item>
        <Form.Item label="更新人（可选）" name="updatedBy">
          <Input placeholder="例如：operator-01" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
