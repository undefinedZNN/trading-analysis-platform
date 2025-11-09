// frontend/src/modules/backtesting/components/ValidationErrorItem.tsx

import React from 'react';
import { Tag, Typography, Space } from 'antd';
import {
  CloseCircleOutlined,
  WarningOutlined,
  CodeOutlined,
  BugOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { ErrorType, ErrorSeverity } from '../types/validation';
import './ValidationErrorItem.less';

const { Text } = Typography;

interface ValidationErrorItemProps {
  type: ErrorType;
  severity: ErrorSeverity;
  line: number;
  column: number;
  message: string;
  code?: string | number;
  ruleId?: string;
  fixable?: boolean;
  onClick: () => void;
}

const ValidationErrorItem: React.FC<ValidationErrorItemProps> = ({
  type,
  severity,
  line,
  column,
  message,
  code,
  ruleId,
  fixable,
  onClick,
}) => {
  const getSeverityIcon = () => {
    if (severity === 'error') {
      return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
    }
    return <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />;
  };

  const getTypeIcon = () => {
    if (type === 'typescript') {
      return <CodeOutlined style={{ color: '#3178c6' }} />;
    }
    return <BugOutlined style={{ color: '#4b32c3' }} />;
  };

  const getTypeTag = () => {
    if (type === 'typescript') {
      return (
        <Tag color="blue" icon={getTypeIcon()}>
          TypeScript
        </Tag>
      );
    }
    return (
      <Tag color="purple" icon={getTypeIcon()}>
        ESLint
      </Tag>
    );
  };

  return (
    <div className="validation-error-item" onClick={onClick}>
      <div className="validation-error-item-header">
        <Space size="small">
          {getSeverityIcon()}
          {getTypeTag()}
          <Text type="secondary">
            第{line}行:{column}列
          </Text>
          {fixable && (
            <Tag color="green" icon={<ToolOutlined />}>
              可修复
            </Tag>
          )}
        </Space>
      </div>
      <div className="validation-error-item-message">
        <Text>{message}</Text>
      </div>
      {(code || ruleId) && (
        <div className="validation-error-item-footer">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {type === 'typescript' ? `TS${code}` : ruleId}
          </Text>
        </div>
      )}
    </div>
  );
};

export default ValidationErrorItem;

