import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Typography, message } from 'antd';
import type { DatasetDto } from '../../../shared/api/tradingData';
import { updateDataset } from '../../../shared/api/tradingData';
import TagInput from './TagInput';
import { RECOMMENDED_DATASET_TAGS } from '../../../shared/constants/tradingData';

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

  const initialLabels = useMemo(() => dataset?.labels ?? [], [dataset]);

  useEffect(() => {
    if (open && dataset) {
      form.setFieldsValue({
        description: dataset.description ?? '',
        labels: initialLabels,
        updatedBy: '',
      });
    } else {
      form.resetFields();
    }
  }, [open, dataset, form, initialLabels]);

  if (!dataset) {
    return null;
  }

  const handleSubmit = async (values: { description?: string; labels?: string[]; updatedBy?: string }) => {
    const payload = {
      description: values.description?.trim() ? values.description.trim() : null,
      labels: Array.isArray(values.labels) ? values.labels : [],
      updatedBy: values.updatedBy?.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const updated = await updateDataset(dataset.datasetId, payload);
      message.success('元数据已更新');
      onUpdated?.(updated);
      onCancel();
    } catch (error) {
      console.error(error);
      message.error('更新元数据失败，请稍后重试');
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
