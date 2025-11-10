/**
 * 版本对比页面
 * 
 * 允许用户选择两个版本进行对比
 * 展示代码差异和Schema差异
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Select,
  Button,
  Space,
  Tabs,
  message,
  Spin,
  Alert,
  Row,
  Col,
  Tag,
  Typography,
} from 'antd';
import {
  SwapOutlined,
  ReloadOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import MonacoCodeDiffViewer from '../components/MonacoCodeDiffViewer';
import {
  VersionCompareApi,
  CompareMode,
  type CompareVersionsResponse,
  type VersionForCompare,
} from '../services/versionCompareApi';
import './VersionComparePage.less';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

/**
 * 版本对比页面
 */
export const VersionComparePage: React.FC = () => {
  const { strategyId } = useParams<{ strategyId: string }>();

  // 状态
  const [versions, setVersions] = useState<VersionForCompare[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState<string>('');
  const [targetVersionId, setTargetVersionId] = useState<string>('');
  const [compareResult, setCompareResult] = useState<CompareVersionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [activeTab, setActiveTab] = useState('code');

  // 加载版本列表
  const loadVersions = async () => {
    if (!strategyId) return;

    setLoadingVersions(true);
    try {
      const data = await VersionCompareApi.getVersionsForCompare(strategyId);
      setVersions(data);

      // 默认选择最新的两个版本
      if (data.length >= 2) {
        setSourceVersionId(data[1].id);
        setTargetVersionId(data[0].id);
      }
    } catch (error: any) {
      message.error(`加载版本列表失败: ${error.message}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  // 执行对比
  const handleCompare = async () => {
    if (!strategyId || !sourceVersionId || !targetVersionId) {
      message.warning('请选择要对比的版本');
      return;
    }

    if (sourceVersionId === targetVersionId) {
      message.warning('请选择不同的版本进行对比');
      return;
    }

    setLoading(true);
    try {
      const result = await VersionCompareApi.compareVersions(strategyId, {
        sourceVersionId,
        targetVersionId,
        mode: CompareMode.FULL,
      });

      setCompareResult(result);

      if (!result.hasDifferences) {
        message.info('两个版本没有差异');
      }
    } catch (error: any) {
      message.error(`对比失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 交换版本
  const handleSwapVersions = () => {
    const temp = sourceVersionId;
    setSourceVersionId(targetVersionId);
    setTargetVersionId(temp);
  };

  // 初始化
  useEffect(() => {
    loadVersions();
  }, [strategyId]);

  // 版本选择器选项
  const versionOptions = versions.map((v) => ({
    label: (
      <Space>
        <span>{v.version}</span>
        {v.isActive && <Tag color="blue">当前</Tag>}
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {new Date(v.createdAt).toLocaleString()}
        </Text>
      </Space>
    ),
    value: v.id,
  }));

  return (
    <div className="version-compare-page">
      <Card>
        <Title level={4}>
          <HistoryOutlined /> 版本对比
        </Title>

        {/* 版本选择器 */}
        <Card className="version-selector-card" size="small">
          <Row gutter={16} align="middle">
            <Col span={10}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>基准版本</Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择基准版本"
                  value={sourceVersionId}
                  onChange={setSourceVersionId}
                  options={versionOptions}
                  loading={loadingVersions}
                  disabled={loading}
                />
              </Space>
            </Col>

            <Col span={4} style={{ textAlign: 'center' }}>
              <Button
                icon={<SwapOutlined />}
                onClick={handleSwapVersions}
                disabled={!sourceVersionId || !targetVersionId || loading}
              >
                交换
              </Button>
            </Col>

            <Col span={10}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>对比版本</Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择对比版本"
                  value={targetVersionId}
                  onChange={setTargetVersionId}
                  options={versionOptions}
                  loading={loadingVersions}
                  disabled={loading}
                />
              </Space>
            </Col>
          </Row>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Space>
              <Button
                type="primary"
                icon={<SwapOutlined />}
                onClick={handleCompare}
                loading={loading}
                disabled={!sourceVersionId || !targetVersionId}
              >
                开始对比
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadVersions}
                loading={loadingVersions}
              >
                刷新版本列表
              </Button>
            </Space>
          </div>
        </Card>

        {/* 对比结果 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" tip="正在对比版本..." />
          </div>
        )}

        {!loading && compareResult && (
          <Card className="compare-result-card">
            {/* 对比信息 */}
            <Alert
              message={
                <Space>
                  <Text>
                    对比: <Tag color="blue">{compareResult.sourceVersion.version}</Tag>
                    vs
                    <Tag color="green">{compareResult.targetVersion.version}</Tag>
                  </Text>
                  <Text type="secondary">
                    对比时间: {new Date(compareResult.comparedAt).toLocaleString()}
                  </Text>
                </Space>
              }
              type={compareResult.hasDifferences ? 'info' : 'success'}
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* 差异标签页 */}
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              {/* 代码差异 */}
              <TabPane tab="代码差异" key="code">
                {compareResult.codeDiff ? (
                  <MonacoCodeDiffViewer
                    oldCode={compareResult.codeDiff.sourceCode}
                    newCode={compareResult.codeDiff.targetCode}
                    oldVersion={compareResult.sourceVersion.version}
                    newVersion={compareResult.targetVersion.version}
                    language="typescript"
                    showStats={true}
                    height={600}
                  />
                ) : (
                  <Alert message="没有代码差异数据" type="info" />
                )}
              </TabPane>

              {/* Schema差异 */}
              <TabPane tab="Schema差异" key="schema">
                {compareResult.schemaDiff ? (
                  <div>
                    {/* 参数差异 */}
                    <Card title="参数Schema差异" size="small" style={{ marginBottom: 16 }}>
                      {compareResult.schemaDiff.parameters.added.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Text strong style={{ color: '#52c41a' }}>新增参数:</Text>
                          <ul>
                            {compareResult.schemaDiff.parameters.added.map((field, index) => (
                              <li key={index}>
                                <Tag color="green">{field.fieldName}</Tag>
                                {field.description && <Text type="secondary">{field.description}</Text>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.parameters.removed.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Text strong style={{ color: '#ff4d4f' }}>删除参数:</Text>
                          <ul>
                            {compareResult.schemaDiff.parameters.removed.map((field, index) => (
                              <li key={index}>
                                <Tag color="red">{field.fieldName}</Tag>
                                {field.description && <Text type="secondary">{field.description}</Text>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.parameters.modified.length > 0 && (
                        <div>
                          <Text strong style={{ color: '#1890ff' }}>修改参数:</Text>
                          <ul>
                            {compareResult.schemaDiff.parameters.modified.map((field, index) => (
                              <li key={index}>
                                <Tag color="blue">{field.fieldName}</Tag>
                                <Text type="secondary">
                                  {JSON.stringify(field.sourceValue)} → {JSON.stringify(field.targetValue)}
                                </Text>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.parameters.added.length === 0 &&
                        compareResult.schemaDiff.parameters.removed.length === 0 &&
                        compareResult.schemaDiff.parameters.modified.length === 0 && (
                          <Alert message="参数Schema没有变化" type="success" />
                        )}
                    </Card>

                    {/* 因子差异 */}
                    <Card title="因子Schema差异" size="small">
                      {compareResult.schemaDiff.factors.added.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Text strong style={{ color: '#52c41a' }}>新增因子:</Text>
                          <ul>
                            {compareResult.schemaDiff.factors.added.map((field, index) => (
                              <li key={index}>
                                <Tag color="green">{field.fieldName}</Tag>
                                {field.description && <Text type="secondary">{field.description}</Text>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.factors.removed.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Text strong style={{ color: '#ff4d4f' }}>删除因子:</Text>
                          <ul>
                            {compareResult.schemaDiff.factors.removed.map((field, index) => (
                              <li key={index}>
                                <Tag color="red">{field.fieldName}</Tag>
                                {field.description && <Text type="secondary">{field.description}</Text>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.factors.modified.length > 0 && (
                        <div>
                          <Text strong style={{ color: '#1890ff' }}>修改因子:</Text>
                          <ul>
                            {compareResult.schemaDiff.factors.modified.map((field, index) => (
                              <li key={index}>
                                <Tag color="blue">{field.fieldName}</Tag>
                                <Text type="secondary">
                                  {JSON.stringify(field.sourceValue)} → {JSON.stringify(field.targetValue)}
                                </Text>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {compareResult.schemaDiff.factors.added.length === 0 &&
                        compareResult.schemaDiff.factors.removed.length === 0 &&
                        compareResult.schemaDiff.factors.modified.length === 0 && (
                          <Alert message="因子Schema没有变化" type="success" />
                        )}
                    </Card>
                  </div>
                ) : (
                  <Alert message="没有Schema差异数据" type="info" />
                )}
              </TabPane>
            </Tabs>
          </Card>
        )}

        {!loading && !compareResult && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text type="secondary">请选择版本并点击"开始对比"</Text>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VersionComparePage;

