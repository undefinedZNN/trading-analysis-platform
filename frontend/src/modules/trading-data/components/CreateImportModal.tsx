import { useEffect, useState, type ChangeEvent } from 'react';
import { Modal, Form, Input, Select, Typography, message } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { createImport } from '../../../shared/api/tradingData';
import TagInput from './TagInput';
import { RECOMMENDED_DATASET_TAGS } from '../../../shared/constants/tradingData';

const { TextArea } = Input;
const { Paragraph } = Typography;

type CreateImportModalProps = {
  open: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
};

type CreateImportFormValues = {
  source?: string | null;
  tradingPair: string;
  granularity: string;
  labels?: string[];
  description?: string | null;
  createdBy?: string | null;
};

export default function CreateImportModal({
  open,
  onCancel,
  onSuccess,
}: CreateImportModalProps) {
  const [form] = Form.useForm();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setUploadFile(null);
    }
  }, [open, form]);

  const handleSubmit = async (values: CreateImportFormValues) => {
    if (!uploadFile) {
      message.warning('请先选择 CSV 文件');
      return;
    }

    const labels: string[] = Array.isArray(values.labels) ? values.labels : [];

    const metadata = {
      source: values.source || null,
      tradingPair: values.tradingPair,
      granularity: values.granularity,
      labels,
      description: values.description || null,
    };

    const formData = new FormData();
    formData.append('pluginName', 'CsvOhlcvPlugin');
    formData.append('pluginVersion', '1.0.0');
    if (values.createdBy) {
      formData.append('createdBy', values.createdBy);
    }
    formData.append('metadata', JSON.stringify(metadata));
    formData.append('file', uploadFile);

    setSubmitting(true);
    try {
      await createImport(formData);
      message.success('导入任务已创建');
      onSuccess?.();
      onCancel();
    } catch (error) {
      console.error(error);
      message.error('创建导入任务失败，请检查后端日志');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建导入任务"
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="提交导入"
      okButtonProps={{ icon: <CloudUploadOutlined />, disabled: !uploadFile }}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ granularity: '1m' }}
        onFinish={handleSubmit}
      >
        <Form.Item label="数据来源（可选）" name="source">
          <Input placeholder="例：binance" allowClear />
        </Form.Item>

        <Form.Item
          label="交易对"
          name="tradingPair"
          rules={[{ required: true, message: '请填写交易对' }]}
        >
          <Input placeholder="例：BTC/USDT" />
        </Form.Item>

        <Form.Item
          label="时间粒度"
          name="granularity"
          rules={[{ required: true, message: '请选择时间粒度' }]}
        >
          <Select
            placeholder="请选择粒度"
            options={[
              { value: '1s', label: '1 秒' },
              { value: '1m', label: '1 分钟' },
              { value: '5m', label: '5 分钟' },
              { value: '1h', label: '1 小时' },
              { value: '1d', label: '1 天' },
              { value: 'unknown', label: '未知/其他' },
            ]}
          />
        </Form.Item>

        <Form.Item label="标签" name="labels">
          <TagInput
            placeholder="输入或选择标签"
            suggestions={Array.from(RECOMMENDED_DATASET_TAGS)}
            allowClear
          />
        </Form.Item>

        <Form.Item label="描述" name="description">
          <TextArea rows={3} placeholder="可填写备注信息" allowClear />
        </Form.Item>

        <Form.Item label="创建人（可选）" name="createdBy">
          <Input placeholder="例：researcher-01" allowClear />
        </Form.Item>

        <Form.Item label="CSV 文件" required>
          <input
            type="file"
            accept=".csv"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0] ?? null;
              setUploadFile(file);
            }}
          />
          {uploadFile && (
            <Paragraph type="secondary" style={{ marginTop: 8 }}>
              已选择：{uploadFile.name}
            </Paragraph>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}
