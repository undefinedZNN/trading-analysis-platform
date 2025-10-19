import { useEffect, useState } from 'react';
import {
  Modal,
  Descriptions,
  Typography,
  Upload,
  Form,
  Input,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import type { DatasetDto } from '../../../shared/api/tradingData';
import { appendDataset } from '../../../shared/api/tradingData';

const { Text } = Typography;

type AppendDatasetModalProps = {
  open: boolean;
  dataset: DatasetDto | null;
  onCancel: () => void;
  onSuccess?: () => void;
};

export default function AppendDatasetModal({
  open,
  dataset,
  onCancel,
  onSuccess,
}: AppendDatasetModalProps) {
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setFile(null);
    }
  }, [open, form]);

  const uploadProps: UploadProps = {
    beforeUpload: (uploadFile) => {
      setFile(uploadFile);
      return false;
    },
    maxCount: 1,
    accept: '.csv',
    onRemove: () => {
      setFile(null);
    },
  };

  const handleSubmit = async (values: { createdBy?: string }) => {
    if (!dataset) {
      return;
    }
    if (!file) {
      message.warning('请先选择追加的数据文件');
      return;
    }

    const formData = new FormData();
    formData.append('pluginName', 'CsvOhlcvPlugin');
    formData.append('pluginVersion', '1.0.0');
    if (values.createdBy) {
      formData.append('createdBy', values.createdBy.trim());
    }
    formData.append('file', file);

    setSubmitting(true);
    try {
      await appendDataset(dataset.datasetId, formData);
      message.success('追加任务已创建');
      onSuccess?.();
      onCancel();
    } catch (error) {
      console.error(error);
      message.error('追加数据失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const footerDisabled = !dataset;

  return (
    <Modal
      open={open}
      title={dataset ? `追加数据集 #${dataset.datasetId}` : '追加数据集'}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okButtonProps={{ disabled: footerDisabled || !file }}
      confirmLoading={submitting}
      destroyOnClose
    >
      {dataset ? (
        <>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="来源">{dataset.source || '-'}</Descriptions.Item>
            <Descriptions.Item label="交易对">{dataset.tradingPair}</Descriptions.Item>
            <Descriptions.Item label="时间粒度">{dataset.granularity}</Descriptions.Item>
            <Descriptions.Item label="当前时间范围">
              {new Date(dataset.timeStart).toLocaleString()} ~{' '}
              {new Date(dataset.timeEnd).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item label="追加文件" required>
              <Upload {...uploadProps}>
                <Text underline style={{ cursor: 'pointer' }}>
                  点击选择文件
                </Text>
              </Upload>
              {!file && <Text type="secondary">支持 CSV 单文件上传。</Text>}
            </Form.Item>
            <Form.Item label="创建人（可选）" name="createdBy">
              <Input placeholder="例如：operator-01" allowClear />
            </Form.Item>
          </Form>
        </>
      ) : (
        <Text type="secondary">未选择数据集。</Text>
      )}
    </Modal>
  );
}
