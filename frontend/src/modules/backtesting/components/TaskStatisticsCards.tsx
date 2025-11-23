import React from 'react';
import { Card, Row, Col, Statistic, Spin, Alert } from 'antd';
import {
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
  PercentageOutlined,
} from '@ant-design/icons';
import type { TaskStatistics } from '../../../api/tasks-adapter';

interface TaskStatisticsCardsProps {
  statistics?: TaskStatistics;
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
}

/**
 * 任务统计卡片组件
 * 
 * 展示回测任务的统计信息，包括总数、各状态数量、成功率和平均执行时间
 */
export const TaskStatisticsCards: React.FC<TaskStatisticsCardsProps> = ({
  statistics,
  loading = false,
  error = null,
  onRefresh,
}) => {
  // 错误状态
  if (error) {
    return (
      <Alert
        message="加载统计信息失败"
        description={error.message}
        type="error"
        showIcon
        closable
        action={
          onRefresh && (
            <a onClick={onRefresh}>
              重试
            </a>
          )
        }
        style={{ marginBottom: 24 }}
      />
    );
  }

  // 加载状态
  if (loading || !statistics) {
    return (
      <Card style={{ marginBottom: 24 }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="加载统计信息..." />
        </div>
      </Card>
    );
  }

  // 计算百分比
  const getPercentage = (count: number) => {
    if (statistics.total === 0) return 0;
    return ((count / statistics.total) * 100).toFixed(1);
  };

  // 格式化执行时间
  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <Row gutter={[16, 16]}>
        {/* 总任务数 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="总任务数"
              value={statistics.total}
              prefix={<ThunderboltOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        {/* 待执行 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="待执行"
              value={statistics.pending}
              suffix={`(${getPercentage(statistics.pending)}%)`}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 执行中 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="执行中"
              value={statistics.running}
              suffix={`(${getPercentage(statistics.running)}%)`}
              prefix={<LoadingOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 已完成 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="已完成"
              value={statistics.completed}
              suffix={`(${getPercentage(statistics.completed)}%)`}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 失败 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="失败"
              value={statistics.failed}
              suffix={`(${getPercentage(statistics.failed)}%)`}
              prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 已取消 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="已取消"
              value={statistics.cancelled}
              suffix={`(${getPercentage(statistics.cancelled)}%)`}
              prefix={<StopOutlined style={{ color: '#8c8c8c' }} />}
              valueStyle={{ color: '#8c8c8c', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 暂停中 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="暂停中"
              value={statistics.paused}
              suffix={`(${getPercentage(statistics.paused)}%)`}
              prefix={<PauseCircleOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1', fontSize: 20 }}
            />
          </Card>
        </Col>

        {/* 成功率 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={3}>
          <Card>
            <Statistic
              title="成功率"
              value={(statistics.successRate * 100).toFixed(1)}
              suffix="%"
              prefix={<PercentageOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{
                color: statistics.successRate >= 0.8 ? '#52c41a' : statistics.successRate >= 0.5 ? '#faad14' : '#ff4d4f',
                fontSize: 20,
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* 第二行：平均执行时间 */}
      {statistics.averageExecutionTime > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={8} lg={6} xl={6}>
            <Card>
              <Statistic
                title="平均执行时间"
                value={formatExecutionTime(statistics.averageExecutionTime)}
                prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default TaskStatisticsCards;

