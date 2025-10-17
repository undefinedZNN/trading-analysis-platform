import { useState } from 'react';
import { Card, Form, Input, Select, Button, Typography, message } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { createImport } from '../../../shared/api/tradingData';

const { Paragraph } = Typography;
const { Option } = Select;

type UploadPageProps = {
  onUploaded?: () => void;
};

export function UploadPage({ onUploaded }: UploadPageProps) {
  const [form] = Form.useForm();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: any) => {
    if (!uploadFile) {
      message.warning('请先选择 CSV 文件');
      return;
    }

    const labels = values.labels
      ? String(values.labels)
          .split(',')
          .map((label: string) => label.trim())
          .filter((label: string) => label.length > 0)
      : [];

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
      setUploadFile(null);
      form.resetFields();
      onUploaded?.();
    } catch (error) {
      console.error(error);
      message.error('创建导入任务失败，请检查后端日志');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="CSV 数据导入" bordered={false} className="card-section">
      <Paragraph type="secondary">
        上传单个 CSV 文件，系统会自动完成格式校验、清洗及数据入库。建议在 PC 端浏览器中操作。
      </Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="upload-form"
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
          <Select placeholder="请选择粒度">
            <Option value="1s">1 秒</Option>
            <Option value="1m">1 分钟</Option>
            <Option value="5m">5 分钟</Option>
            <Option value="1h">1 小时</Option>
            <Option value="1d">1 天</Option>
            <Option value="unknown">未知/其他</Option>
          </Select>
        </Form.Item>
        <Form.Item label="标签（逗号分隔）" name="labels">
          <Input placeholder="例：crypto,spot" allowClear />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="可填写备注信息" allowClear />
        </Form.Item>
        <Form.Item label="创建人（可选）" name="createdBy">
          <Input placeholder="例：researcher-01" allowClear />
        </Form.Item>
        <Form.Item label="CSV 文件" required>
          <input
            type="file"
            accept=".csv"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              setUploadFile(file ?? null);
            }}
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<CloudUploadOutlined />}
            disabled={!uploadFile}
            loading={submitting}
          >
            提交导入
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default UploadPage;
