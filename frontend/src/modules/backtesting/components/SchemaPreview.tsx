import { Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React from 'react';

const { Text } = Typography;

export type SchemaField = {
  key: string;
  label?: string;
  type?: string;
  component?: string;
  desc?: string | null;
  required?: boolean;
  defaultValue?: unknown;
  enumOptions?: Array<{ label: string; value: unknown }>;
  validator?: unknown;
};

export interface SchemaPreviewProps {
  parameters?: SchemaField[] | null;
  factors?: SchemaField[] | null;
  title?: string;
  showParameters?: boolean;
  showFactors?: boolean;
}

const renderDefaultValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return <Text type="secondary">—</Text>;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const schemaColumns: ColumnsType<SchemaField> = [
  {
    title: '字段 key',
    dataIndex: 'key',
    key: 'key',
    width: 160,
    ellipsis: true,
  },
  {
    title: '名称',
    dataIndex: 'label',
    key: 'label',
    width: 160,
    ellipsis: true,
    render: (value?: string) => value || <Text type="secondary">—</Text>,
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 100,
  },
  {
    title: '组件',
    dataIndex: 'component',
    key: 'component',
    width: 120,
  },
  {
    title: '必填',
    dataIndex: 'required',
    key: 'required',
    width: 80,
    render: (value?: boolean) =>
      value ? <Tag color="red">必填</Tag> : <Text type="secondary">可选</Text>,
  },
  {
    title: '默认值',
    dataIndex: 'defaultValue',
    key: 'defaultValue',
    ellipsis: true,
    render: renderDefaultValue,
  },
  {
    title: '选项',
    dataIndex: 'enumOptions',
    key: 'enumOptions',
    ellipsis: true,
    render: (options?: Array<{ label: string; value: unknown }>) =>
      options && options.length ? (
        <Space wrap size={4}>
          {options.map((option, index) => (
            <Tag key={`${option.label}-${option.value}-${index}`}>
              {option.label ?? option.value}
            </Tag>
          ))}
        </Space>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
];

const SchemaPreview: React.FC<SchemaPreviewProps> = ({
  parameters,
  factors,
  title,
  showParameters = true,
  showFactors = true,
}) => {
  return (
    <Card size="small" title={title ?? 'Schema 字段'} style={{ marginTop: 12 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {showParameters && (
          <section>
            <Space size={12}>
              <Text strong>参数字段</Text>
              <Text type="secondary">共 {parameters?.length ?? 0} 项</Text>
            </Space>
            {parameters && parameters.length ? (
              <Table<SchemaField>
                rowKey="key"
                columns={schemaColumns}
                dataSource={parameters}
                pagination={false}
                size="small"
                style={{ marginTop: 12 }}
              />
            ) : (
              <Empty description="暂无参数字段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </section>
        )}

        {showFactors && (
          <section>
            <Space size={12}>
              <Text strong>因子字段</Text>
              <Text type="secondary">共 {factors?.length ?? 0} 项</Text>
            </Space>
            {factors && factors.length ? (
              <Table<SchemaField>
                rowKey="key"
                columns={schemaColumns}
                dataSource={factors}
                pagination={false}
                size="small"
                style={{ marginTop: 12 }}
              />
            ) : (
              <Empty description="暂无因子字段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </section>
        )}
      </Space>
    </Card>
  );
};

export default SchemaPreview;
