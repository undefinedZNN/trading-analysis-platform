// frontend/src/modules/backtesting/components/ValidationStatistics.tsx

import React from 'react';
import { Space, Badge, Tag, Typography } from 'antd';
import {
  CloseCircleOutlined,
  WarningOutlined,
  CodeOutlined,
  BugOutlined,
} from '@ant-design/icons';
import './ValidationStatistics.less';

const { Text } = Typography;

interface ValidationStatisticsProps {
  errorCount: number;
  warningCount: number;
  typeScriptCount: number;
  eslintCount: number;
}

const ValidationStatistics: React.FC<ValidationStatisticsProps> = ({
  errorCount,
  warningCount,
  typeScriptCount,
  eslintCount,
}) => {
  return (
    <div className="validation-statistics">
      <Space size="large" wrap>
        <Space size="small">
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
          <Text strong style={{ fontSize: 16 }}>
            {errorCount} 个错误
          </Text>
        </Space>

        <Space size="small">
          <WarningOutlined style={{ color: '#faad14', fontSize: 18 }} />
          <Text strong style={{ fontSize: 16 }}>
            {warningCount} 个警告
          </Text>
        </Space>

        <Space size="small">
          <Tag color="blue" icon={<CodeOutlined />}>
            TypeScript: {typeScriptCount}
          </Tag>
          <Tag color="purple" icon={<BugOutlined />}>
            ESLint: {eslintCount}
          </Tag>
        </Space>
      </Space>
    </div>
  );
};

export default ValidationStatistics;

