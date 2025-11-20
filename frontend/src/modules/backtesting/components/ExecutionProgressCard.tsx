import React from 'react';
import {
  Card,
  Space,
  Progress,
  Statistic,
  Row,
  Col,
} from 'antd';
import { ClockCircleOutlined, RocketOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { type BacktestTask } from '../../../shared/api/backtestTasks';

dayjs.extend(duration);

interface ExecutionProgressCardProps {
  task: BacktestTask;
}

/**
 * 执行进度卡片组件
 * 用于显示运行中任务的执行进度、已运行时长、已处理Bar数等信息
 */
export const ExecutionProgressCard: React.FC<ExecutionProgressCardProps> = ({
  task,
}) => {
  const metricsSnapshot = task.metricsSnapshot as Record<string, any> | undefined;
  const runningTasks =
    typeof metricsSnapshot?.runningTasks === 'number'
      ? metricsSnapshot.runningTasks
      : undefined;
  const throughput =
    typeof metricsSnapshot?.throughput === 'number'
      ? metricsSnapshot.throughput
      : undefined;
  const memoryUsed =
    typeof metricsSnapshot?.memoryUsed === 'number'
      ? metricsSnapshot.memoryUsed
      : undefined;
  const lastUpdatedLabel =
    typeof metricsSnapshot?.lastUpdated === 'string'
      ? dayjs(metricsSnapshot.lastUpdated).format('YYYY-MM-DD HH:mm:ss')
      : undefined;

  /**
   * 计算执行时长
   */
  const getExecutionDuration = () => {
    if (!task.startedAt) {
      return '-';
    }

    const start = dayjs(task.startedAt);
    const now = dayjs();
    const diff = now.diff(start);
    const dur = dayjs.duration(diff);

    const hours = Math.floor(dur.asHours());
    const minutes = dur.minutes();

    if (hours > 0) {
      return `已运行 ${hours}小时${minutes}分`;
    } else {
      return `已运行 ${minutes}分`;
    }
  };

  /**
   * 计算预计剩余时间（基于当前进度）
   */
  const getEstimatedTimeRemaining = () => {
    if (!task.startedAt || !task.progress || task.progress === 0) {
      return null;
    }

    const start = dayjs(task.startedAt);
    const now = dayjs();
    const elapsed = now.diff(start);

    // 根据当前进度估算总时间
    const estimatedTotal = (elapsed / task.progress) * 100;
    const remaining = estimatedTotal - elapsed;

    const dur = dayjs.duration(remaining);
    const hours = Math.floor(dur.asHours());
    const minutes = dur.minutes();

    if (hours > 0) {
      return `约 ${hours}小时${minutes}分`;
    } else if (minutes > 0) {
      return `约 ${minutes}分`;
    } else {
      return '即将完成';
    }
  };

  const remainingTime = getEstimatedTimeRemaining();

  return (
    <Card
      title={
        <Space>
          <RocketOutlined style={{ color: '#1890ff' }} />
          <span>执行状态</span>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 进度条 */}
        <div>
          <div style={{ marginBottom: 8 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span>
                <strong>执行进度</strong>
              </span>
              <span style={{ color: '#8c8c8c' }}>
                {task.progress || 0}%
              </span>
            </Space>
          </div>
          <Progress
            percent={task.progress || 0}
            status="active"
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
          />
        </div>

        {/* 统计信息 */}
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="已运行时长"
              value={getExecutionDuration()}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>

          {task.resultSummary?.processedBars !== undefined && (
            <Col span={8}>
              <Statistic
                title="已处理Bar数"
                value={task.resultSummary.processedBars}
                suffix="个"
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
          )}

          {remainingTime && (
            <Col span={8}>
              <Statistic
                title="预计剩余"
                value={remainingTime}
                valueStyle={{ fontSize: 16, color: '#8c8c8c' }}
              />
            </Col>
          )}

          {runningTasks !== undefined && (
            <Col span={8}>
              <Statistic
                title="Worker 负载"
                value={runningTasks}
                suffix="tasks"
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
          )}

          {throughput !== undefined && (
            <Col span={8}>
              <Statistic
                title="吞吐量"
                value={throughput.toFixed(1)}
                suffix="bars/s"
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
          )}

          {memoryUsed !== undefined && (
            <Col span={8}>
              <Statistic
                title="内存使用"
                value={memoryUsed.toFixed(1)}
                suffix="MB"
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
          )}
        </Row>

        {/* 实时状态提示 */}
        <div
          style={{
            padding: '8px 12px',
            background: '#e6f7ff',
            border: '1px solid #91d5ff',
            borderRadius: 4,
          }}
        >
          <Space>
            <span style={{ color: '#1890ff' }}>●</span>
            <span style={{ color: '#1890ff', fontSize: 14 }}>
              任务正在执行中，进度每分钟自动更新
              {lastUpdatedLabel && `（最近更新：${lastUpdatedLabel}）`}
            </span>
          </Space>
        </div>
      </Space>
    </Card>
  );
};

export default ExecutionProgressCard;
