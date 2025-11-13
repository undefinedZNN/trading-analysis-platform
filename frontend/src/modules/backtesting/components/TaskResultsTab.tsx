import React from 'react';
import {
  Card,
  Space,
  Statistic,
  Row,
  Col,
  Divider,
  Alert,
  Typography,
  Tag,
  Descriptions,
} from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { type BacktestTask } from '../../../shared/api/backtestTasks';
import { BacktestChartsCard } from './BacktestChartsCard';

const { Text } = Typography;

interface TaskResultsTabProps {
  task: BacktestTask;
}

/**
 * 回测结果Tab组件
 * 展示回测结果的详细指标和统计信息
 */
export const TaskResultsTab: React.FC<TaskResultsTabProps> = ({ task }) => {
  // 如果没有结果摘要，显示提示
  if (!task.resultSummary) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="结果数据尚未生成"
          description="回测任务尚未完成或结果数据生成失败"
          type="warning"
          showIcon
        />
      </div>
    );
  }

  const result = task.resultSummary;

  /**
   * 获取收益率颜色
   */
  const getReturnColor = (value: number) => {
    return value >= 0 ? '#3f8600' : '#cf1322';
  };

  /**
   * 获取表现评级
   */
  const getPerformanceRating = () => {
    const { totalReturn, sharpeRatio, maxDrawdown } = result;

    // 简单的评级逻辑
    let score = 0;

    // 收益率评分
    if (totalReturn > 50) score += 3;
    else if (totalReturn > 20) score += 2;
    else if (totalReturn > 0) score += 1;

    // 夏普比率评分
    if (sharpeRatio > 2) score += 3;
    else if (sharpeRatio > 1) score += 2;
    else if (sharpeRatio > 0.5) score += 1;

    // 最大回撤评分（负面指标）
    if (maxDrawdown < 10) score += 3;
    else if (maxDrawdown < 20) score += 2;
    else if (maxDrawdown < 30) score += 1;

    if (score >= 8) return { text: '优秀', color: 'success' };
    if (score >= 6) return { text: '良好', color: 'processing' };
    if (score >= 4) return { text: '中等', color: 'warning' };
    return { text: '较差', color: 'error' };
  };

  const rating = getPerformanceRating();

  /**
   * 计算风险收益比
   */
  const getRiskReturnRatio = () => {
    if (result.maxDrawdown === 0) return '-';
    return (result.totalReturn / Math.abs(result.maxDrawdown)).toFixed(2);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 整体表现评级 */}
      <Card>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space size="large">
              <div>
                <Text type="secondary">整体表现评级</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag
                    color={rating.color}
                    style={{ fontSize: 16, padding: '4px 16px' }}
                  >
                    {rating.text}
                  </Tag>
                </div>
              </div>
              <Divider type="vertical" style={{ height: 60 }} />
              <div>
                <Text type="secondary">回测周期</Text>
                <div style={{ marginTop: 8 }}>
                  <Text strong>
                    {dayjs(task.dataConfig.timeRange.start).format('YYYY-MM-DD')}
                  </Text>
                  <Text type="secondary"> 至 </Text>
                  <Text strong>
                    {dayjs(task.dataConfig.timeRange.end).format('YYYY-MM-DD')}
                  </Text>
                </div>
              </div>
              <Divider type="vertical" style={{ height: 60 }} />
              <div>
                <Text type="secondary">交易周期</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue" style={{ fontSize: 14 }}>
                    {task.dataConfig.timeframe}
                  </Tag>
                </div>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 收益指标 */}
      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#52c41a' }} />
            <span>收益指标</span>
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="总收益率"
              value={result.totalReturn}
              precision={2}
              suffix="%"
              valueStyle={{
                color: getReturnColor(result.totalReturn),
                fontSize: 28,
              }}
              prefix={
                result.totalReturn >= 0 ? (
                  <RiseOutlined />
                ) : (
                  <FallOutlined />
                )
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="年化收益率"
              value={result.annualizedReturn}
              precision={2}
              suffix="%"
              valueStyle={{
                color: getReturnColor(result.annualizedReturn),
                fontSize: 28,
              }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="最终资金"
              value={result.finalCapital}
              precision={2}
              prefix="$"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="初始资金"
              value={task.executionConfig.initialCapital}
              precision={2}
              prefix="$"
              valueStyle={{ fontSize: 28, color: '#8c8c8c' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 风险指标 */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: '#ff4d4f' }} />
            <span>风险指标</span>
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="最大回撤"
              value={result.maxDrawdown}
              precision={2}
              suffix="%"
              valueStyle={{ color: '#cf1322', fontSize: 28 }}
              prefix={<FallOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="夏普比率"
              value={result.sharpeRatio}
              precision={2}
              valueStyle={{
                fontSize: 28,
                color: result.sharpeRatio > 1 ? '#3f8600' : '#8c8c8c',
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {result.sharpeRatio > 2
                ? '优秀'
                : result.sharpeRatio > 1
                ? '良好'
                : result.sharpeRatio > 0.5
                ? '一般'
                : '较差'}
            </Text>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="风险收益比"
              value={getRiskReturnRatio()}
              valueStyle={{ fontSize: 28 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              收益率/最大回撤
            </Text>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="盈亏比"
              value={result.profitLossRatio}
              precision={2}
              valueStyle={{
                fontSize: 28,
                color: result.profitLossRatio > 1.5 ? '#3f8600' : '#8c8c8c',
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* 交易统计 */}
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: '#1890ff' }} />
            <span>交易统计</span>
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="总交易次数"
              value={result.totalTrades}
              suffix="次"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="胜率"
              value={result.winRate}
              precision={2}
              suffix="%"
              valueStyle={{
                fontSize: 28,
                color: result.winRate > 50 ? '#3f8600' : '#8c8c8c',
              }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="盈利交易"
              value={Math.round((result.totalTrades * result.winRate) / 100)}
              suffix="次"
              valueStyle={{ fontSize: 28, color: '#3f8600' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="亏损交易"
              value={
                result.totalTrades -
                Math.round((result.totalTrades * result.winRate) / 100)
              }
              suffix="次"
              valueStyle={{ fontSize: 28, color: '#cf1322' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 执行统计 */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined style={{ color: '#722ed1' }} />
            <span>执行统计</span>
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="已处理Bar数"
              value={result.processedBars}
              suffix="个"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="执行时长"
              value={result.executionTime}
              precision={2}
              suffix="秒"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="处理速度"
              value={
                result.executionTime > 0
                  ? (result.processedBars / result.executionTime).toFixed(0)
                  : 0
              }
              suffix="Bar/秒"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Statistic
              title="平均交易频率"
              value={
                result.processedBars > 0
                  ? ((result.totalTrades / result.processedBars) * 100).toFixed(
                      2,
                    )
                  : 0
              }
              suffix="%"
              valueStyle={{ fontSize: 28 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              每100个Bar的交易次数
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 配置信息 */}
      <Card
        title={
          <Space>
            <DollarOutlined style={{ color: '#fa8c16' }} />
            <span>交易配置</span>
          </Space>
        }
      >
        <Descriptions column={2} bordered>
          <Descriptions.Item label="初始资金">
            <Text strong>
              ${task.executionConfig.initialCapital.toLocaleString()}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="最终资金">
            <Text
              strong
              style={{
                color: getReturnColor(
                  result.finalCapital - task.executionConfig.initialCapital,
                ),
              }}
            >
              ${result.finalCapital.toLocaleString()}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="杠杆倍数">
            <Tag color="orange">{task.executionConfig.leverage}x</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="滑点设置">
            {task.executionConfig.slippage > 0
              ? `${(task.executionConfig.slippage * 100).toFixed(4)}%`
              : '无滑点'}
          </Descriptions.Item>
          <Descriptions.Item label="Maker手续费">
            {(task.executionConfig.fees.makerFee * 100).toFixed(4)}%
          </Descriptions.Item>
          <Descriptions.Item label="Taker手续费">
            {(task.executionConfig.fees.takerFee * 100).toFixed(4)}%
          </Descriptions.Item>
          {task.executionConfig.tradingHours && (
            <Descriptions.Item label="交易时段" span={2}>
              <Tag color="cyan">
                {task.executionConfig.tradingHours.start} ~{' '}
                {task.executionConfig.tradingHours.end}
              </Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 图表展示区域 */}
      <BacktestChartsCard task={task} />

      {/* 结果文件路径 */}
      {task.resultFilePath && (
        <Card title="结果数据">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="结果文件路径">
              <Text code copyable style={{ fontSize: 12 }}>
                {task.resultFilePath}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="文件格式">
              <Tag>Parquet / DuckDB</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </Space>
  );
};

export default TaskResultsTab;

