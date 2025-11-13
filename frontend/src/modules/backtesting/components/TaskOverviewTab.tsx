import React from 'react';
import {
  Descriptions,
  Card,
  Space,
  Alert,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import {
  type BacktestTask,
  BacktestTaskStatus,
} from '../../../shared/api/backtestTasks';
import { ExecutionProgressCard } from './ExecutionProgressCard';
import { TaskErrorCard } from './TaskErrorCard';

dayjs.extend(duration);

const { Text } = Typography;

interface TaskOverviewTabProps {
  task: BacktestTask;
}

/**
 * 任务概览Tab组件
 * 显示任务的详细配置、执行状态、结果摘要等信息
 */
export const TaskOverviewTab: React.FC<TaskOverviewTabProps> = ({ task }) => {
  /**
   * 计算执行时长
   */
  const getExecutionDuration = () => {
    if (task.startedAt && task.completedAt) {
      const start = dayjs(task.startedAt);
      const end = dayjs(task.completedAt);
      const diff = end.diff(start);
      const dur = dayjs.duration(diff);
      
      const hours = Math.floor(dur.asHours());
      const minutes = dur.minutes();
      const seconds = dur.seconds();
      
      if (hours > 0) {
        return `${hours}小时${minutes}分${seconds}秒`;
      } else if (minutes > 0) {
        return `${minutes}分${seconds}秒`;
      } else {
        return `${seconds}秒`;
      }
    }
    
    if (task.startedAt) {
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
    }
    
    return '-';
  };


  /**
   * 渲染结果摘要卡片（完成状态）
   */
  const renderResultSummary = () => {
    if (
      task.status !== BacktestTaskStatus.COMPLETED ||
      !task.resultSummary
    ) {
      return null;
    }

    const summary = task.resultSummary;

    return (
      <Card
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>回测结果摘要</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Statistic
              title="总收益率"
              value={summary.totalReturn}
              precision={2}
              suffix="%"
              valueStyle={{
                color: summary.totalReturn >= 0 ? '#3f8600' : '#cf1322',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="年化收益率"
              value={summary.annualizedReturn}
              precision={2}
              suffix="%"
              valueStyle={{
                color: summary.annualizedReturn >= 0 ? '#3f8600' : '#cf1322',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="最大回撤"
              value={summary.maxDrawdown}
              precision={2}
              suffix="%"
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="夏普比率"
              value={summary.sharpeRatio}
              precision={2}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="胜率"
              value={summary.winRate}
              precision={2}
              suffix="%"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="盈亏比"
              value={summary.profitLossRatio}
              precision={2}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="交易次数"
              value={summary.totalTrades}
              suffix="次"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="最终资金"
              value={summary.finalCapital}
              precision={2}
              prefix="$"
            />
          </Col>
        </Row>

        <Divider />

        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              title="已处理Bar数"
              value={summary.processedBars}
              suffix="个"
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="执行时长"
              value={summary.executionTime}
              precision={2}
              suffix="秒"
            />
          </Col>
        </Row>
      </Card>
    );
  };

  /**
   * 格式化策略参数
   */
  const renderStrategyParams = () => {
    if (!task.strategyParams || Object.keys(task.strategyParams).length === 0) {
      return <Text type="secondary">无自定义参数</Text>;
    }

    return (
      <Descriptions column={2} size="small" bordered>
        {Object.entries(task.strategyParams).map(([key, value]) => (
          <Descriptions.Item label={key} key={key}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 执行状态（运行中） - 使用独立组件 */}
      {task.status === BacktestTaskStatus.RUNNING && (
        <ExecutionProgressCard task={task} />
      )}

      {/* 错误信息（失败或取消） - 使用独立组件 */}
      {(task.status === BacktestTaskStatus.FAILED ||
        task.status === BacktestTaskStatus.CANCELLED) && (
        <TaskErrorCard task={task} />
      )}

      {/* 结果摘要（完成） */}
      {renderResultSummary()}

      {/* 任务基本信息 */}
      <Card title="任务基本信息">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="任务ID" span={2}>
            <Text code copyable>
              {task.taskId}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="任务名称">
            {task.taskName}
          </Descriptions.Item>
          <Descriptions.Item label="任务状态">
            {task.status === BacktestTaskStatus.PENDING && (
              <Tag icon={<ClockCircleOutlined />} color="default">
                待执行
              </Tag>
            )}
            {task.status === BacktestTaskStatus.RUNNING && (
              <Tag icon={<RocketOutlined />} color="processing">
                执行中
              </Tag>
            )}
            {task.status === BacktestTaskStatus.COMPLETED && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                已完成
              </Tag>
            )}
            {task.status === BacktestTaskStatus.FAILED && (
              <Tag icon={<CloseCircleOutlined />} color="error">
                失败
              </Tag>
            )}
            {task.status === BacktestTaskStatus.CANCELLED && (
              <Tag icon={<WarningOutlined />} color="warning">
                已取消
              </Tag>
            )}
          </Descriptions.Item>
          {task.taskDescription && (
            <Descriptions.Item label="任务描述" span={2}>
              {task.taskDescription}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="创建时间">
            {dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {task.startedAt
              ? dayjs(task.startedAt).format('YYYY-MM-DD HH:mm:ss')
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {task.completedAt
              ? dayjs(task.completedAt).format('YYYY-MM-DD HH:mm:ss')
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="执行时长">
            {getExecutionDuration()}
          </Descriptions.Item>
          {task.createdBy && (
            <Descriptions.Item label="创建者" span={2}>
              {task.createdBy}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 策略信息 */}
      <Card title="策略信息">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="策略ID">
            <Text code copyable>
              {task.strategyId}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="脚本版本ID">
            <Text code copyable>
              {task.scriptVersionId}
            </Text>
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left" plain>
          策略参数
        </Divider>
        {renderStrategyParams()}
      </Card>

      {/* 数据配置 */}
      <Card title="数据配置">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="数据集ID">
            <Text code>{task.datasetId}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="交易周期">
            <Tag color="blue">{task.dataConfig.timeframe}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="回测开始时间">
            {dayjs(task.dataConfig.timeRange.start).format(
              'YYYY-MM-DD HH:mm:ss',
            )}
          </Descriptions.Item>
          <Descriptions.Item label="回测结束时间">
            {dayjs(task.dataConfig.timeRange.end).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 执行配置 */}
      <Card title="执行配置">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="初始资金">
            <Text strong>${task.executionConfig.initialCapital.toLocaleString()}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="杠杆倍数">
            <Tag color="orange">{task.executionConfig.leverage}x</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="滑点设置">
            {task.executionConfig.slippage > 0
              ? `${(task.executionConfig.slippage * 100).toFixed(4)}%`
              : '无滑点'}
          </Descriptions.Item>
          <Descriptions.Item label="手续费配置">
            <Space direction="vertical" size="small">
              <Text>
                Maker: {(task.executionConfig.fees.makerFee * 100).toFixed(4)}%
              </Text>
              <Text>
                Taker: {(task.executionConfig.fees.takerFee * 100).toFixed(4)}%
              </Text>
            </Space>
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

      {/* 结果文件路径（如果有） */}
      {task.resultFilePath && (
        <Card title="结果数据">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="结果文件路径">
              <Text code copyable>
                {task.resultFilePath}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </Space>
  );
};

export default TaskOverviewTab;

