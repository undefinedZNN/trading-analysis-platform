import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Progress,
  Space,
  Tag,
} from 'antd';
import type {
  BacktestTaskDto,
} from '../../../shared/api/backtesting';
import {
  BacktestTaskStatus,
  cancelBacktestTask,
  getBacktestTask,
} from '../../../shared/api/backtesting';

const STATUS_COLORS: Record<BacktestTaskStatus, string> = {
  [BacktestTaskStatus.SUBMITTED]: 'default',
  [BacktestTaskStatus.QUEUED]: 'processing',
  [BacktestTaskStatus.RUNNING]: 'processing',
  [BacktestTaskStatus.FINISHED]: 'success',
  [BacktestTaskStatus.FAILED]: 'error',
  [BacktestTaskStatus.CANCELLED]: 'warning',
};

const STATUS_TEXT: Record<BacktestTaskStatus, string> = {
  [BacktestTaskStatus.SUBMITTED]: '已提交',
  [BacktestTaskStatus.QUEUED]: '排队中',
  [BacktestTaskStatus.RUNNING]: '运行中',
  [BacktestTaskStatus.FINISHED]: '已完成',
  [BacktestTaskStatus.FAILED]: '失败',
  [BacktestTaskStatus.CANCELLED]: '已取消',
};

const BacktestTaskDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<BacktestTaskDto | null>(null);
  const [loading, setLoading] = useState(false);

  const numericTaskId = taskId ? parseInt(taskId, 10) : null;

  const loadTask = useCallback(async () => {
    if (!numericTaskId) return;
    setLoading(true);
    try {
      const res = await getBacktestTask(numericTaskId);
      setTask(res);
    } catch (error) {
      console.error(error);
      message.error('任务不存在或已被删除');
      navigate('/backtest/tasks', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [numericTaskId, navigate, message]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const handleCancel = useCallback(async () => {
    if (!task) return;
    try {
      await cancelBacktestTask(task.taskId);
      message.success('任务已取消');
      await loadTask();
    } catch (error) {
      console.error(error);
      message.error('取消任务失败，请稍后重试');
    }
  }, [task, loadTask, message]);

  if (!numericTaskId) {
    return (
      <Card>
        <Alert
          type="error"
          message="任务 ID 无效"
          action={
            <Button type="primary" onClick={() => navigate('/backtest/tasks')}>
              返回列表
            </Button>
          }
        />
      </Card>
    );
  }

  if (loading || !task) {
    return (
      <Card loading={loading}>
        <Alert type="info" message="正在加载任务信息..." />
      </Card>
    );
  }

  const canCancel =
    task.status === BacktestTaskStatus.SUBMITTED ||
    task.status === BacktestTaskStatus.QUEUED ||
    task.status === BacktestTaskStatus.RUNNING;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="任务概览"
        extra={
          <Space>
            {canCancel && (
              <Button danger onClick={handleCancel}>
                取消任务
              </Button>
            )}
            <Button onClick={() => navigate('/backtest/tasks')}>返回列表</Button>
          </Space>
        }
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="任务 ID">{task.taskId}</Descriptions.Item>
          <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item>
          <Descriptions.Item label="任务状态">
            <Tag color={STATUS_COLORS[task.status]}>{STATUS_TEXT[task.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="执行进度">
            {task.progress !== undefined ? (
              <Progress percent={task.progress} size="small" style={{ width: 200 }} />
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="任务描述" span={2}>
            {task.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(task.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {new Date(task.updatedAt).toLocaleString()}
          </Descriptions.Item>
          {task.startedAt && (
            <Descriptions.Item label="开始时间">
              {new Date(task.startedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {task.finishedAt && (
            <Descriptions.Item label="完成时间">
              {new Date(task.finishedAt).toLocaleString()}
            </Descriptions.Item>
          )}
          {task.errorMessage && (
            <Descriptions.Item label="错误信息" span={2}>
              <Alert type="error" message={task.errorMessage} />
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="策略与数据配置">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="策略">
            {task.strategy ? (
              <Space>
                {task.strategy.name}
                <Button
                  size="small"
                  type="link"
                  onClick={() => navigate(`/backtest/strategies/${task.strategyId}`)}
                >
                  查看详情
                </Button>
              </Space>
            ) : (
              task.strategyId
            )}
          </Descriptions.Item>
          <Descriptions.Item label="脚本版本">
            {task.scriptVersion?.versionCode || task.scriptId}
          </Descriptions.Item>
          <Descriptions.Item label="数据集">
            {task.dataset ? `${task.dataset.source}` : task.datasetId}
          </Descriptions.Item>
          <Descriptions.Item label="回测时间范围">
            {new Date(task.backtestStartDate).toLocaleDateString()} ~{' '}
            {new Date(task.backtestEndDate).toLocaleDateString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="回测配置">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="初始资金">
            {task.config.initialCapital.toLocaleString()} 元
          </Descriptions.Item>
          <Descriptions.Item label="时间级别">
            {task.config.timeLevel}
          </Descriptions.Item>
          {task.config.slippageModel && (
            <>
              <Descriptions.Item label="滑点模型">
                {task.config.slippageModel.type === 'fixed'
                  ? '固定滑点'
                  : task.config.slippageModel.type === 'percentage'
                  ? '百分比滑点'
                  : '自定义滑点'}
              </Descriptions.Item>
              <Descriptions.Item label="滑点值">
                {task.config.slippageModel.value}
                {task.config.slippageModel.type === 'percentage' ? '%' : ''}
              </Descriptions.Item>
            </>
          )}
          {task.config.commission && (
            <>
              <Descriptions.Item label="手续费模型">
                {task.config.commission.type === 'fixed' ? '固定手续费' : '百分比手续费'}
              </Descriptions.Item>
              <Descriptions.Item label="手续费率">
                {task.config.commission.value}
                {task.config.commission.type === 'percentage' ? '%' : ''}
              </Descriptions.Item>
            </>
          )}
          {task.config.tradingSessions && task.config.tradingSessions.length > 0 && (
            <Descriptions.Item label="交易时段" span={2}>
              <Space wrap>
                {task.config.tradingSessions.map((session, idx) => (
                  <Tag key={idx} color={session.enabled ? 'blue' : 'default'}>
                    {session.name}: {session.startTime} - {session.endTime}
                  </Tag>
                ))}
              </Space>
            </Descriptions.Item>
          )}
          {task.config.riskConstraints && (
            <>
              {task.config.riskConstraints.maxDrawdownPercent !== undefined && (
                <Descriptions.Item label="最大回撤">
                  {task.config.riskConstraints.maxDrawdownPercent}%
                </Descriptions.Item>
              )}
              {task.config.riskConstraints.maxDailyLossPercent !== undefined && (
                <Descriptions.Item label="最大单日亏损">
                  {task.config.riskConstraints.maxDailyLossPercent}%
                </Descriptions.Item>
              )}
              {task.config.riskConstraints.maxPositionSize !== undefined && (
                <Descriptions.Item label="最大持仓数量">
                  {task.config.riskConstraints.maxPositionSize}
                </Descriptions.Item>
              )}
              {task.config.riskConstraints.maxLeverage !== undefined && (
                <Descriptions.Item label="最大杠杆倍数">
                  {task.config.riskConstraints.maxLeverage}x
                </Descriptions.Item>
              )}
            </>
          )}
          {task.config.strategyParams &&
            Object.keys(task.config.strategyParams).length > 0 && (
              <Descriptions.Item label="策略参数" span={2}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(task.config.strategyParams, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
        </Descriptions>
      </Card>

      {task.resultSummary && (
        <Card title="回测结果摘要">
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(task.resultSummary, null, 2)}
          </pre>
        </Card>
      )}
    </Space>
  );
};

export default BacktestTaskDetailPage;

