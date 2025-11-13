import React, { useState, useEffect } from 'react';
import {
  Breadcrumb,
  Card,
  Tabs,
  Spin,
  Alert,
  Space,
  Button,
  Descriptions,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  HomeOutlined,
  RocketOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  fetchBacktestTask,
  type BacktestTask,
  BacktestTaskStatus,
} from '../../../shared/api/backtestTasks';
import { TaskOverviewTab } from '../components/TaskOverviewTab';
import { TaskLogsTab } from '../components/TaskLogsTab';
import { TaskResultsTab } from '../components/TaskResultsTab';
import { TaskTradesTab } from '../components/TaskTradesTab';

const { Title, Text } = Typography;

/**
 * 任务详情页
 */
export const TaskDetailPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<BacktestTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isPolling, setIsPolling] = useState(false);

  /**
   * 加载任务详情
   */
  const loadTask = async () => {
    if (!taskId) {
      setError('任务ID不存在');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchBacktestTask(taskId);
      setTask(data);
    } catch (err: any) {
      setError(err.message || '加载任务详情失败');
      message.error('加载任务详情失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 初始加载
   */
  useEffect(() => {
    loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  /**
   * 进度轮询
   * 当任务状态为RUNNING时，每60秒自动刷新一次
   */
  useEffect(() => {
    // 如果任务不存在或状态不是RUNNING，停止轮询
    if (!task || task.status !== BacktestTaskStatus.RUNNING) {
      setIsPolling(false);
      return;
    }

    // 启动轮询
    setIsPolling(true);

    // 设置定时器，60秒后刷新
    const timer = setInterval(() => {
      console.log('[轮询] 自动刷新任务详情...');
      loadTask();
    }, 60000); // 60秒 = 60000毫秒

    // 清理函数：组件卸载或依赖变化时清除定时器
    return () => {
      console.log('[轮询] 清除定时器');
      clearInterval(timer);
      setIsPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.status, task?.taskId]);

  /**
   * 获取状态标签配置
   */
  const getStatusTag = (status: BacktestTaskStatus) => {
    const statusMap = {
      [BacktestTaskStatus.PENDING]: { color: 'default', text: '待执行' },
      [BacktestTaskStatus.RUNNING]: { color: 'processing', text: '执行中' },
      [BacktestTaskStatus.COMPLETED]: { color: 'success', text: '已完成' },
      [BacktestTaskStatus.FAILED]: { color: 'error', text: '失败' },
      [BacktestTaskStatus.CANCELLED]: { color: 'warning', text: '已取消' },
    };

    const config = statusMap[status] || { color: 'default', text: status };

    return <Tag color={config.color}>{config.text}</Tag>;
  };

  /**
   * 返回列表
   */
  const handleBack = () => {
    navigate('/backtesting/tasks');
  };

  /**
   * 刷新任务
   */
  const handleRefresh = () => {
    loadTask();
  };

  // 渲染加载状态
  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" style={{ width: '100%' }} align="center">
          <Spin size="large" />
          <Text type="secondary">加载任务详情中...</Text>
        </Space>
      </div>
    );
  }

  // 渲染错误状态
  if (error || !task) {
    return (
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回任务列表
          </Button>
          <Alert
            type="error"
            message="加载失败"
            description={error || '任务不存在'}
            showIcon
            action={
              <Button size="small" onClick={loadTask}>
                重试
              </Button>
            }
          />
        </Space>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 面包屑导航 */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            href: '/',
            title: <HomeOutlined />,
          },
          {
            title: (
              <Link to="/backtesting/tasks">
                <RocketOutlined /> 回测任务
              </Link>
            ),
          },
          {
            title: task.taskName,
          },
        ]}
      />

      {/* 页面头部 */}
      <Card style={{ marginBottom: 16 }}>
        <Space
          direction="vertical"
          style={{ width: '100%' }}
          size="middle"
        >
          {/* 标题和操作按钮 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <Space align="center">
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={handleBack}
                  type="text"
                >
                  返回
                </Button>
                <Title level={3} style={{ margin: 0 }}>
                  {task.taskName}
                </Title>
                {getStatusTag(task.status)}
              </Space>
              {task.taskDescription && (
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  {task.taskDescription}
                </Text>
              )}
            </div>

            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
              >
                刷新
              </Button>
              {isPolling && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <Space size={4}>
                    <span style={{ color: '#52c41a' }}>●</span>
                    <span>自动刷新中（每分钟）</span>
                  </Space>
                </Text>
              )}
            </Space>
          </div>

          {/* 基本信息 */}
          <Descriptions column={4} size="small">
            <Descriptions.Item label="任务ID">{task.taskId}</Descriptions.Item>
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
          </Descriptions>
        </Space>
      </Card>

      {/* Tab内容区域 */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: '概览',
              children: <TaskOverviewTab task={task} />,
            },
            {
              key: 'logs',
              label: '执行日志',
              children: <TaskLogsTab taskId={task.taskId} />,
            },
            {
              key: 'results',
              label: '回测结果',
              disabled: task.status !== BacktestTaskStatus.COMPLETED,
              children: <TaskResultsTab task={task} />,
            },
            {
              key: 'trades',
              label: '交易明细',
              disabled: task.status !== BacktestTaskStatus.COMPLETED,
              children: <TaskTradesTab task={task} />,
            },
            {
              key: 'report',
              label: '交易报表',
              disabled: true, // 下一期功能
              children: (
                <div style={{ padding: '24px' }}>
                  <Alert
                    message="下一期功能"
                    description="交易报表功能将在下一期实现"
                    type="warning"
                    showIcon
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default TaskDetailPage;

