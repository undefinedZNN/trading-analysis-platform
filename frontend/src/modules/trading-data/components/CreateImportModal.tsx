import { useEffect, useState, type ChangeEvent } from 'react';
import { Modal, Form, Input, Select, Typography, message, InputNumber, Card, Space } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { createImport } from '../../../shared/api/tradingData';
import TagInput from './TagInput';
import { RECOMMENDED_DATASET_TAGS } from '../../../shared/constants/tradingData';
import { AssetType, ASSET_TYPE_OPTIONS, type ContractSpecs } from '../../../shared/types/asset-types';

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
  assetType?: AssetType;
  // 合约规格字段
  multiplier?: number;
  marginRatio?: number;
  lotSize?: number;
  tickSize?: number;
};

export default function CreateImportModal({
  open,
  onCancel,
  onSuccess,
}: CreateImportModalProps) {
  const [form] = Form.useForm();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setUploadFile(null);
      setSelectedAssetType(undefined);
    }
  }, [open, form]);

  const handleSubmit = async (values: CreateImportFormValues) => {
    if (!uploadFile) {
      message.warning('请先选择 CSV 文件');
      return;
    }

    const labels: string[] = Array.isArray(values.labels) ? values.labels : [];

    // 构建合约规格（仅在有值时包含）
    const contractSpecs: ContractSpecs | undefined =
      values.multiplier || values.marginRatio || values.lotSize || values.tickSize
        ? {
            ...(values.multiplier && { multiplier: values.multiplier }),
            ...(values.marginRatio && { marginRatio: values.marginRatio }),
            ...(values.lotSize && { lotSize: values.lotSize }),
            ...(values.tickSize && { tickSize: values.tickSize }),
          }
        : undefined;

    const metadata = {
      source: values.source || null,
      tradingPair: values.tradingPair,
      granularity: values.granularity,
      labels,
      description: values.description || null,
      ...(values.assetType && { assetType: values.assetType }),
      ...(contractSpecs && { contractSpecs }),
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

        <Form.Item label="资产类型（可选）" name="assetType">
          <Select
            placeholder="请选择资产类型"
            options={ASSET_TYPE_OPTIONS}
            allowClear
            onChange={(value) => {
              setSelectedAssetType(value);
              // 切换资产类型时清空合约规格字段
              form.setFieldsValue({
                multiplier: undefined,
                marginRatio: undefined,
                lotSize: undefined,
                tickSize: undefined,
              });
            }}
          />
        </Form.Item>

        {/* 合约规格配置（根据资产类型显示） */}
        {(selectedAssetType === AssetType.Futures || selectedAssetType === AssetType.Stock) && (
          <Card
            size="small"
            title={
              <Space>
                <span>合约规格配置</span>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                  （可选）
                </Typography.Text>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {selectedAssetType === AssetType.Futures && (
              <>
                <Form.Item
                  label="合约乘数"
                  name="multiplier"
                  tooltip="每手对应的标的物数量，例如螺纹钢期货为 10 吨/手"
                >
                  <InputNumber
                    min={1}
                    placeholder="例：10"
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  label="保证金比例"
                  name="marginRatio"
                  tooltip="交易所规定的保证金比例，例如 0.09 表示 9%"
                >
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.01}
                    placeholder="例：0.09"
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  label="最小变动价位"
                  name="tickSize"
                  tooltip="合约价格的最小变动单位"
                >
                  <InputNumber
                    min={0}
                    step={0.01}
                    placeholder="例：1.0"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </>
            )}

            {selectedAssetType === AssetType.Stock && (
              <Form.Item
                label="最小交易单位"
                name="lotSize"
                tooltip="最小交易单位，例如 A 股为 100 股/手"
              >
                <InputNumber
                  min={1}
                  placeholder="例：100"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
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
