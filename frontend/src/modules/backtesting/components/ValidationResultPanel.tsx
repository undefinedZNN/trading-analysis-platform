// frontend/src/modules/backtesting/components/ValidationResultPanel.tsx

import React, { useMemo, useState } from 'react';
import { Card, Empty, Spin, Select, Space, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import ValidationStatistics from './ValidationStatistics';
import ValidationErrorItem from './ValidationErrorItem';
import type {
  TypeScriptError,
  ESLintError,
  ErrorType,
  ErrorSeverity,
  FilterOptions,
} from '../types/validation';
import './ValidationResultPanel.less';

const { Text } = Typography;
const { Option } = Select;

interface ValidationResultPanelProps {
  typeScriptErrors?: TypeScriptError[];
  typeScriptWarnings?: TypeScriptError[];
  eslintErrors?: ESLintError[];
  eslintWarnings?: ESLintError[];
  onErrorClick?: (line: number, column: number) => void;
  loading?: boolean;
}

interface CombinedError {
  type: ErrorType;
  severity: ErrorSeverity;
  line: number;
  column: number;
  message: string;
  code?: string | number;
  ruleId?: string;
  fixable?: boolean;
}

const ValidationResultPanel: React.FC<ValidationResultPanelProps> = ({
  typeScriptErrors = [],
  typeScriptWarnings = [],
  eslintErrors = [],
  eslintWarnings = [],
  onErrorClick,
  loading = false,
}) => {
  const [filterType, setFilterType] = useState<ErrorType | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<ErrorSeverity | 'all'>('all');

  // 合并所有错误和警告
  const allErrors = useMemo(() => {
    const errors: CombinedError[] = [];

    // TypeScript错误
    typeScriptErrors.forEach((err) => {
      errors.push({
        type: 'typescript',
        severity: 'error',
        line: err.line,
        column: err.column,
        message: err.message,
        code: err.code,
      });
    });

    // TypeScript警告
    typeScriptWarnings.forEach((warn) => {
      errors.push({
        type: 'typescript',
        severity: 'warning',
        line: warn.line,
        column: warn.column,
        message: warn.message,
        code: warn.code,
      });
    });

    // ESLint错误
    eslintErrors.forEach((err) => {
      errors.push({
        type: 'eslint',
        severity: 'error',
        line: err.line,
        column: err.column,
        message: err.message,
        ruleId: err.ruleId || undefined,
        fixable: err.fixable,
      });
    });

    // ESLint警告
    eslintWarnings.forEach((warn) => {
      errors.push({
        type: 'eslint',
        severity: 'warning',
        line: warn.line,
        column: warn.column,
        message: warn.message,
        ruleId: warn.ruleId || undefined,
        fixable: warn.fixable,
      });
    });

    // 按行号排序
    return errors.sort((a, b) => {
      if (a.line !== b.line) {
        return a.line - b.line;
      }
      return a.column - b.column;
    });
  }, [typeScriptErrors, typeScriptWarnings, eslintErrors, eslintWarnings]);

  // 筛选后的错误
  const filteredErrors = useMemo(() => {
    return allErrors.filter((error) => {
      if (filterType !== 'all' && error.type !== filterType) {
        return false;
      }
      if (filterSeverity !== 'all' && error.severity !== filterSeverity) {
        return false;
      }
      return true;
    });
  }, [allErrors, filterType, filterSeverity]);

  // 统计数据
  const statistics = useMemo(() => {
    const errorCount = typeScriptErrors.length + eslintErrors.length;
    const warningCount = typeScriptWarnings.length + eslintWarnings.length;
    const typeScriptCount = typeScriptErrors.length + typeScriptWarnings.length;
    const eslintCount = eslintErrors.length + eslintWarnings.length;

    return {
      errorCount,
      warningCount,
      typeScriptCount,
      eslintCount,
    };
  }, [typeScriptErrors, typeScriptWarnings, eslintErrors, eslintWarnings]);

  const handleErrorClick = (line: number, column: number) => {
    if (onErrorClick) {
      onErrorClick(line, column);
    }
  };

  // 如果正在加载
  if (loading) {
    return (
      <Card className="validation-result-panel">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在校验代码..." />
        </div>
      </Card>
    );
  }

  // 如果没有任何错误或警告
  if (allErrors.length === 0) {
    return (
      <Card className="validation-result-panel">
        <Empty
          image={<CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />}
          description={
            <Space direction="vertical" size="small">
              <Text strong style={{ fontSize: 16 }}>
                代码校验通过
              </Text>
              <Text type="secondary">没有发现任何错误或警告</Text>
            </Space>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="validation-result-panel" bodyStyle={{ padding: 0 }}>
      <ValidationStatistics {...statistics} />

      <div className="validation-result-panel-filters">
        <Space size="middle">
          <Space size="small">
            <Text>类型:</Text>
            <Select
              value={filterType}
              onChange={setFilterType}
              style={{ width: 120 }}
              size="small"
            >
              <Option value="all">全部</Option>
              <Option value="typescript">TypeScript</Option>
              <Option value="eslint">ESLint</Option>
            </Select>
          </Space>

          <Space size="small">
            <Text>级别:</Text>
            <Select
              value={filterSeverity}
              onChange={setFilterSeverity}
              style={{ width: 100 }}
              size="small"
            >
              <Option value="all">全部</Option>
              <Option value="error">错误</Option>
              <Option value="warning">警告</Option>
            </Select>
          </Space>

          <Text type="secondary">
            显示 {filteredErrors.length} / {allErrors.length} 项
          </Text>
        </Space>
      </div>

      <div className="validation-result-panel-list">
        {filteredErrors.length === 0 ? (
          <Empty description="没有符合筛选条件的项目" style={{ padding: '40px 0' }} />
        ) : (
          filteredErrors.map((error, index) => (
            <ValidationErrorItem
              key={index}
              type={error.type}
              severity={error.severity}
              line={error.line}
              column={error.column}
              message={error.message}
              code={error.code}
              ruleId={error.ruleId}
              fixable={error.fixable}
              onClick={() => handleErrorClick(error.line, error.column)}
            />
          ))
        )}
      </div>
    </Card>
  );
};

export default ValidationResultPanel;

