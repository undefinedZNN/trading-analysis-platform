import React from 'react';
import { Card, Tag, Progress, Descriptions, Space, Button, Tooltip, Popconfirm, message } from 'antd';
import {
  ClockCircleOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  EyeOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CopyOutlined,
  CaretRightOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import {
  type BacktestTask,
  BacktestTaskStatus,
  cancelBacktestTask,
  pauseBacktestTask,
  resumeBacktestTask,
  retryBacktestTask,
  deleteBacktestTask,
  executeBacktestTask,
} from '../../../api/tasks-adapter';

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Item } = Descriptions;

interface BacktestTaskCardProps {
  task: BacktestTask;
  onView?: (taskId: string) => void;
  onUpdate?: () => void;
}

/**
 * 回测任务卡片组件
 */
export const BacktestTaskCard: React.FC<BacktestTaskCardProps> = ({
  task,
  onView,
  onUpdate,
}) => {
  const logEvent = (message: string, payload?: unknown) => {
    if (payload !== undefined) {
      console.info(`[BacktestTaskCard] ${message}`, payload);
    } else {
      console.info(`[BacktestTaskCard] ${message}`);
    }
  };
  /**
   * 获取状态标签配置
   */
  const getStatusConfig = (status: BacktestTaskStatus) => {
    switch (status) {
      case BacktestTaskStatus.PENDING:
        return {
          color: 'default',
          icon: <ClockCircleOutlined />,
          text: '待执行',
        };
      case BacktestTaskStatus.RUNNING:
        return {
          color: 'processing',
          icon: <RocketOutlined />,
          text: '执行中',
        };
      case BacktestTaskStatus.COMPLETED:
        return {
          color: 'success',
          icon: <CheckCircleOutlined />,
          text: '已完成',
        };
      case BacktestTaskStatus.FAILED:
        return {
          color: 'error',
          icon: <CloseCircleOutlined />,
          text: '失败',
        };
      case BacktestTaskStatus.CANCELLED:
        return {
          color: 'warning',
          icon: <StopOutlined />,
          text: '已取消',
        };
      case 'paused' as BacktestTaskStatus:
        return {
          color: 'purple',
          icon: <PauseOutlined />,
          text: '已暂停',
        };
      default:
        return {
          color: 'default',
          icon: null,
          text: status,
        };
    }
  };

  /**
   * 暂停任务
   */
  const handlePause = async () => {
    try {
      logEvent('请求暂停任务', { taskId: task.taskId });
      await pauseBacktestTask(task.taskId);
      message.success('任务已暂停');
      logEvent('任务暂停成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 暂停任务失败', error);
      message.error('暂停任务失败: ' + error.message);
    }
  };

  /**
   * 恢复任务
   */
  const handleResume = async () => {
    try {
      logEvent('请求恢复任务', { taskId: task.taskId });
      await resumeBacktestTask(task.taskId);
      message.success('任务已恢复');
      logEvent('任务恢复成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 恢复任务失败', error);
      message.error('恢复任务失败: ' + error.message);
    }
  };

  /**
   * 取消任务
   */
  const handleCancel = async () => {
    try {
      logEvent('请求取消任务', { taskId: task.taskId });
      await cancelBacktestTask(task.taskId);
      message.success('任务已取消');
      logEvent('任务取消成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 取消任务失败', error);
      message.error('取消任务失败: ' + error.message);
    }
  };

  /**
   * 开始任务
   */
  const handleExecute = async () => {
    try {
      logEvent('请求开始任务', { taskId: task.taskId });
      await executeBacktestTask(task.taskId);
      message.success('任务已开始');
      logEvent('任务开始成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 开始任务失败', error);
      message.error('开始任务失败: ' + error.message);
    }
  };

  /**
   * 重试任务
   */
  const handleRetry = async () => {
    try {
      logEvent('请求重试任务', { taskId: task.taskId });
      await retryBacktestTask(task.taskId);
      message.success('重试任务已创建');
      logEvent('任务重试成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 重试任务失败', error);
      message.error('重试任务失败: ' + error.message);
    }
  };

  /**
   * 删除任务
   */
  const handleDelete = async () => {
    try {
      logEvent('请求删除任务', { taskId: task.taskId });
      await deleteBacktestTask(task.taskId);
      message.success('任务已删除');
      logEvent('任务删除成功', { taskId: task.taskId });
      onUpdate?.();
    } catch (error: any) {
      console.error('[BacktestTaskCard] 删除任务失败', error);
      message.error('删除任务失败: ' + error.message);
    }
  };

  /**
   * 计算执行时长
   */
  const getExecutionDuration = () => {
    if (!task.startedAt) return '-';
    const endTime = task.completedAt ? dayjs(task.completedAt) : dayjs();
    const startTime = dayjs(task.startedAt);
    const diff = endTime.diff(startTime);
    return dayjs.duration(diff).humanize();
  };

  /**
   * 格式化百分比
   */
  const formatPercent = (value?: number | string) => {
    if (value === undefined || value === null) return '-';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(numeric)) {
      return '-';
    }
    return `${numeric.toFixed(2)}%`;
  };

  /**
   * 格式化数字
   */
  const formatNumber = (value?: number) => {
    if (value === undefined || value === null) return '-';
    return value.toLocaleString();
  };

  const metricsSnapshot = task.metricsSnapshot as Record<string, any> | undefined;
  const metricsPreview = metricsSnapshot
    ? Object.entries(metricsSnapshot)
        .filter(([, value]) => value !== undefined && value !== null)
        .slice(0, 3)
    : [];

  const formatMetricValue = (value: unknown) => {
    if (typeof value === 'number') {
      return value.toFixed(2).replace(/\.00$/, '');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const statusConfig = getStatusConfig(task.status);

  return (
    <Card
      hoverable
      style={{ height: '100%' }}
      styles={{
        body: { padding: '16px' },
      }}
    >
      {/* 任务头部 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {task.taskName}
            </h3>
            {task.taskDescription && (
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#999' }}>
                {task.taskDescription}
              </p>
            )}
          </div>
          <Tag color={statusConfig.color} icon={statusConfig.icon}>
            {statusConfig.text}
          </Tag>
        </div>
      </div>

      {/* Worker & 指标 */}
      <Space wrap size="small" style={{ marginBottom: 12 }}>
        <Tag color="geekblue">
          Worker: {task.assignedWorkerId || '未分配 / 本地执行'}
        </Tag>
        {metricsPreview.map(([key, value]) => (
          <Tag color="cyan" key={key}>
            {key}: {formatMetricValue(value)}
          </Tag>
        ))}
      </Space>

      {/* 进度条（运行中时显示） */}
      {task.status === BacktestTaskStatus.RUNNING && task.progress !== undefined && (
        <div style={{ marginBottom: 12 }}>
          <Progress
            percent={task.progress}
            status="active"
            strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
          />
          
          {/* 进度详情 */}
          {task.metricsSnapshot && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#666', lineHeight: '20px' }}>
              <Space wrap size="middle">
                {task.metricsSnapshot.totalBars && (
                  <span>
                    📊 数据进度: {formatNumber(task.metricsSnapshot.processedBars || 0)} / 
                    {formatNumber(task.metricsSnapshot.totalBars)} bars
                  </span>
                )}
                {task.metricsSnapshot.currentDate && (
                  <span>
                    📅 当前时间: {task.metricsSnapshot.currentDate}
                  </span>
                )}
                {task.metricsSnapshot.estimatedTimeLeft && (
                  <span>
                    ⏱ 预计剩余: {dayjs.duration(task.metricsSnapshot.estimatedTimeLeft * 1000).humanize()}
                  </span>
                )}
              </Space>
            </div>
          )}
        </div>
      )}

      {/* 任务信息 */}
      <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
        <Item label="创建时间">
          <Tooltip title={dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}>
            {dayjs(task.createdAt).fromNow()}
          </Tooltip>
        </Item>
        <Item label="执行时长">{getExecutionDuration()}</Item>
        
        {task.dataConfig && (
          <>
            <Item label="时间周期">{task.dataConfig.timeframe}</Item>
            <Item label="初始资金">
              ${formatNumber(task.executionConfig.initialCapital)}
            </Item>
          </>
        )}
      </Descriptions>

      {/* 结果摘要（已完成时显示） */}
      {task.status === BacktestTaskStatus.COMPLETED && task.resultSummary && (
        <div
          style={{
            background: '#f6f8fa',
            padding: 12,
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          <Descriptions column={2} size="small">
            <Item label="总收益">
              <span
                style={{
                  color: task.resultSummary.totalReturn >= 0 ? '#52c41a' : '#ff4d4f',
                  fontWeight: 600,
                }}
              >
                {formatPercent(task.resultSummary.totalReturn)}
              </span>
            </Item>
            <Item label="最大回撤">
              <span style={{ color: '#ff4d4f' }}>
                {formatPercent(task.resultSummary.maxDrawdown)}
              </span>
            </Item>
            <Item label="夏普比率">
              {task.resultSummary.sharpeRatio !== undefined &&
              task.resultSummary.sharpeRatio !== null
                ? task.resultSummary.sharpeRatio.toFixed(2)
                : '-'}
            </Item>
            <Item label="交易次数">
              {formatNumber(task.resultSummary.totalTrades)}
            </Item>
            <Item label="胜率">
              {formatPercent(task.resultSummary.winRate)}
            </Item>
            <Item label="盈亏比">
              {task.resultSummary.profitLossRatio !== undefined &&
              task.resultSummary.profitLossRatio !== null
                ? task.resultSummary.profitLossRatio.toFixed(2)
                : '-'}
            </Item>
          </Descriptions>
        </div>
      )}

      {/* 错误信息（失败时显示） */}
      {task.status === BacktestTaskStatus.FAILED && task.errorMessage && (
        <div
          style={{
            background: '#fff2f0',
            padding: 12,
            borderRadius: 4,
            marginBottom: 12,
            border: '1px solid #ffccc7',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#ff4d4f' }}>
            <CloseCircleOutlined style={{ marginRight: 4 }} />
            错误: {task.errorMessage}
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => onView?.(task.taskId)}
        >
          查看详情
        </Button>

        {task.status === BacktestTaskStatus.PENDING && (
          <Tooltip title="开始执行">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<CaretRightOutlined />}
              onClick={handleExecute}
            >
              开始
            </Button>
          </Tooltip>
        )}

        {task.status === BacktestTaskStatus.RUNNING && (
          <>
            <Popconfirm
              title="确定要暂停该任务吗？"
              description="暂停后任务将停止执行"
              onConfirm={handlePause}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="暂停任务">
                <Button
                  size="small"
                  icon={<PauseOutlined />}
                >
                  暂停
                </Button>
              </Tooltip>
            </Popconfirm>
            <Popconfirm
              title="确定要取消该任务吗？"
              description="取消后任务将无法恢复"
              onConfirm={handleCancel}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="取消任务">
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                >
                  取消
                </Button>
              </Tooltip>
            </Popconfirm>
          </>
        )}

        {task.status === 'paused' && (
          <Tooltip title="恢复任务">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<CaretRightOutlined />}
              onClick={handleResume}
            >
              恢复
            </Button>
          </Tooltip>
        )}

        {task.status === BacktestTaskStatus.FAILED && (
          <Tooltip title="重试任务">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRetry}
            >
              重试
            </Button>
          </Tooltip>
        )}

        {(
          [
            BacktestTaskStatus.COMPLETED,
            BacktestTaskStatus.FAILED,
            BacktestTaskStatus.CANCELLED,
          ] as BacktestTaskStatus[]
        ).includes(task.status) && (
          <Tooltip title="复制配置">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                // TODO: 实现复制配置逻辑
                message.info('复制配置功能即将上线');
              }}
            >
              复制
            </Button>
          </Tooltip>
        )}

        {task.status !== BacktestTaskStatus.RUNNING && (
          <Popconfirm
            title="确定要删除该任务吗？"
            description="删除后将无法恢复"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除任务">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        )}
      </Space>
    </Card>
  );
};

export default BacktestTaskCard;
