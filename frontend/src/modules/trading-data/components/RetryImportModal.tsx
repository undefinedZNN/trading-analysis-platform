import { useState } from 'react';
import { Modal, Space, Switch, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';

const { Paragraph, Text, Link } = Typography;

type RetryImportModalProps = {
  open: boolean;
  loading?: boolean;
  importId?: number;
  onOk: (options: { reuseOriginalFile: boolean; file?: File | null }) => Promise<void> | void;
  onCancel: () => void;
};

export function RetryImportModal({ open, loading, importId, onOk, onCancel }: RetryImportModalProps) {
  const [reuseOriginal, setReuseOriginal] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async () => {
    if (!reuseOriginal && !file) {
      message.warning('请上传新的 CSV 文件或勾选复用原始文件');
      return;
    }
    await onOk({ reuseOriginalFile: reuseOriginal, file });
    setFile(null);
    setReuseOriginal(true);
  };

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

  return (
    <Modal
      title={`重试导入任务 #${importId ?? '-'}`}
      open={open}
      onCancel={() => {
        setFile(null);
        setReuseOriginal(true);
        onCancel();
      }}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="提交重试"
      destroyOnClose
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Paragraph type="secondary">
          将任务重新推入清洗流程，可选择复用原始文件或上传最新文件。
        </Paragraph>
        <Space>
          <Text>复用原始文件：</Text>
          <Switch checked={reuseOriginal} onChange={setReuseOriginal} />
        </Space>
        {!reuseOriginal && (
          <Upload {...uploadProps}>
            <Link>点击上传新的 CSV 文件</Link>
          </Upload>
        )}
      </Space>
    </Modal>
  );
}

export default RetryImportModal;
