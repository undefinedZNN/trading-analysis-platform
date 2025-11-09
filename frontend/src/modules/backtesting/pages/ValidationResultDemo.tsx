// frontend/src/modules/backtesting/pages/ValidationResultDemo.tsx
// 这是一个演示页面，用于展示ValidationResultPanel和CodeEditorWithValidation组件

import React, { useState } from 'react';
import { Button, Space, Card, Typography, Row, Col, message, Alert, Select } from 'antd';
import { PlayCircleOutlined, ClearOutlined, FileAddOutlined } from '@ant-design/icons';
import ValidationResultPanel from '../components/ValidationResultPanel';
import CodeEditorWithValidation from '../components/CodeEditorWithValidation';
import { useCodeValidation } from '../hooks/useCodeValidation';
import { getDefaultStrategyTemplate } from '../templates/defaultStrategyTemplate';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const ValidationResultDemo: React.FC = () => {
  const [useMockData, setUseMockData] = useState(false);
  const [code, setCode] = useState(getDefaultStrategyTemplate('full'));

  // 使用校验Hook
  const { validationResult, isValidating, error, validate, clear } = useCodeValidation();

  const handleLoadTemplate = (type: 'full' | 'simple') => {
    setCode(getDefaultStrategyTemplate(type));
    clear();
    message.success(`已加载${type === 'full' ? '完整' : '简化'}策略模板`);
  };

  // 模拟TypeScript错误
  const mockTypeScriptErrors: TypeScriptError[] = [
    {
      line: 10,
      column: 15,
      message: "Type 'string' is not assignable to type 'number'.",
      code: 2322,
      category: 'error',
    },
    {
      line: 25,
      column: 8,
      message: "Cannot find name 'undefinedVar'.",
      code: 2304,
      category: 'error',
    },
  ];

  const mockTypeScriptWarnings: TypeScriptError[] = [
    {
      line: 15,
      column: 20,
      message: "'x' is declared but its value is never read.",
      code: 6133,
      category: 'warning',
    },
  ];

  // 模拟ESLint错误
  const mockESLintErrors: ESLintError[] = [
    {
      line: 30,
      column: 5,
      message: 'Missing semicolon.',
      ruleId: 'semi',
      severity: 'error',
      fixable: true,
    },
  ];

  const mockESLintWarnings: ESLintError[] = [
    {
      line: 12,
      column: 3,
      message: 'Unexpected console statement.',
      ruleId: 'no-console',
      severity: 'warning',
      fixable: false,
    },
    {
      line: 18,
      column: 10,
      message: 'Unexpected use of \'any\'.',
      ruleId: '@typescript-eslint/no-explicit-any',
      severity: 'warning',
      fixable: false,
    },
  ];

  const handleErrorClick = (line: number, column: number) => {
    console.log(`跳转到第${line}行第${column}列`);
    message.info(`跳转到第${line}行第${column}列`);
  };

  const handleValidate = async () => {
    if (!code.trim()) {
      message.warning('请输入代码');
      return;
    }

    try {
      await validate(code);
      message.success('代码校验完成');
    } catch (err) {
      // 错误已经在Hook中处理
      console.error('校验失败:', err);
    }
  };

  const handleClear = () => {
    clear();
    message.info('已清除校验结果');
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
  };

  // 获取显示的错误数据（真实API或模拟数据）
  const displayErrors = useMockData
    ? {
        typeScriptErrors: mockTypeScriptErrors,
        typeScriptWarnings: mockTypeScriptWarnings,
        eslintErrors: mockESLintErrors,
        eslintWarnings: mockESLintWarnings,
      }
    : {
        typeScriptErrors: validationResult?.typeScript.errors || [],
        typeScriptWarnings: validationResult?.typeScript.warnings || [],
        eslintErrors: validationResult?.eslint.errors || [],
        eslintWarnings: validationResult?.eslint.warnings || [],
      };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Title level={2}>代码校验系统 - 完整演示</Title>
        <Paragraph>
          这是集成了Monaco编辑器和校验结果展示的完整演示。
          编辑器中会实时显示错误标记（红色波浪线）和警告标记（黄色波浪线）。
        </Paragraph>

        <Space style={{ marginBottom: 16 }} wrap>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleValidate}
            loading={isValidating}
            disabled={isValidating}
          >
            {isValidating ? '校验中...' : '开始校验'}
          </Button>
          <Button icon={<ClearOutlined />} onClick={handleClear} disabled={isValidating}>
            清除结果
          </Button>
          
          <Select
            placeholder="加载模板"
            style={{ width: 150 }}
            onChange={handleLoadTemplate}
            disabled={isValidating}
          >
            <Option value="full">
              <FileAddOutlined /> 完整策略模板
            </Option>
            <Option value="simple">
              <FileAddOutlined /> 简化策略模板
            </Option>
          </Select>
          
          <Button onClick={() => setUseMockData(!useMockData)}>
            {useMockData ? '使用真实API' : '使用模拟数据'}
          </Button>
          <Text type="secondary">提示：按 Ctrl+S / Cmd+S 快速触发校验</Text>
        </Space>

        {/* 错误提示 */}
        {error && (
          <Alert
            message="校验失败"
            description={error}
            type="error"
            closable
            onClose={handleClear}
            style={{ marginTop: 16 }}
          />
        )}

        {/* 成功提示 */}
        {validationResult && !error && (
          <Alert
            message="校验完成"
            description={
              <Space direction="vertical" size="small">
                <Text>
                  TypeScript: {validationResult.typeScript.errors.length} 个错误,{' '}
                  {validationResult.typeScript.warnings.length} 个警告 (
                  {validationResult.typeScript.executionTime.toFixed(2)}ms)
                </Text>
                <Text>
                  ESLint: {validationResult.eslint.errors.length} 个错误,{' '}
                  {validationResult.eslint.warnings.length} 个警告 (
                  {validationResult.eslint.executionTime.toFixed(2)}ms)
                </Text>
              </Space>
            }
            type={
              validationResult.typeScript.errors.length === 0 &&
              validationResult.eslint.errors.length === 0
                ? 'success'
                : 'warning'
            }
            closable
            onClose={handleClear}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={14}>
          <Card title="代码编辑器" bodyStyle={{ padding: 0 }}>
            <CodeEditorWithValidation
              value={code}
              onChange={handleCodeChange}
              typeScriptErrors={displayErrors.typeScriptErrors}
              typeScriptWarnings={displayErrors.typeScriptWarnings}
              eslintErrors={displayErrors.eslintErrors}
              eslintWarnings={displayErrors.eslintWarnings}
              height="600px"
              onValidationRequest={handleValidate}
            />
          </Card>
        </Col>

        <Col span={10}>
          <Card title="校验结果" bodyStyle={{ padding: 0 }}>
            <ValidationResultPanel
              typeScriptErrors={displayErrors.typeScriptErrors}
              typeScriptWarnings={displayErrors.typeScriptWarnings}
              eslintErrors={displayErrors.eslintErrors}
              eslintWarnings={displayErrors.eslintWarnings}
              onErrorClick={handleErrorClick}
              loading={isValidating}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ValidationResultDemo;

