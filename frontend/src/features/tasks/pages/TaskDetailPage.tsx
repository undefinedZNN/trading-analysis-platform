import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Tabs,
  Table,
  Typography,
  message,
  Modal,
  Progress,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiClient } from '../../../api/client';
import { TaskStatus, getStatusConfig } from '../utils/taskStatus';
import type { BacktestTask } from '../../../api/types/task';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

/**
 * 任务详情页面
 */
export const TaskDetailPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<BacktestTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (taskId) {
      loadTask();
      // 如果任务正在运行，启动轮询
      const interval = setInterval(() => {
        if (task?.status === TaskStatus.RUNNING) {
          loadTask(true);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [taskId, task?.status]);

  const loadTask = async (silent = false) => {
    if (!taskId) return;
    
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.tasks.getById(taskId);
      setTask(response);
    } catch (error: any) {
      message.error(error.message || '加载任务详情失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!taskId) return;
    
    Modal.confirm({
      title: '确认执行',
      content: '确定要开始执行此回测任务吗？',
      onOk: async () => {
        setActionLoading(true);
        try {
          await apiClient.tasks.execute(taskId);
          message.success('任务已开始执行');
          loadTask();
        } catch (error: any) {
          message.error(error.message || '执行任务失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handlePause = async () => {
    if (!taskId) return;
    
    setActionLoading(true);
    try {
      await apiClient.tasks.pause(taskId);
      message.success('任务已暂停');
      loadTask();
    } catch (error: any) {
      message.error(error.message || '暂停任务失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!taskId) return;
    
    setActionLoading(true);
    try {
      await apiClient.tasks.resume(taskId);
      message.success('任务已恢复');
      loadTask();
    } catch (error: any) {
      message.error(error.message || '恢复任务失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!taskId) return;
    
    Modal.confirm({
      title: '确认取消',
      content: '确定要取消此任务吗？此操作不可撤销。',
      okText: '确认取消',
      okType: 'danger',
      onOk: async () => {
        setActionLoading(true);
        try {
          await apiClient.tasks.cancel(taskId);
          message.success('任务已取消');
          loadTask();
        } catch (error: any) {
          message.error(error.message || '取消任务失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const renderActions = () => {
    if (!task) return null;

    const actions: React.ReactNode[] = [];

    switch (task.status) {
      case TaskStatus.PENDING:
        actions.push(
          <Button
            key="execute"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleExecute}
            loading={actionLoading}
          >
            开始执行
          </Button>
        );
        break;

      case TaskStatus.RUNNING:
        actions.push(
          <Button
            key="pause"
            icon={<PauseCircleOutlined />}
            onClick={handlePause}
            loading={actionLoading}
          >
            暂停
          </Button>,
          <Button
            key="cancel"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleCancel}
            loading={actionLoading}
          >
            取消
          </Button>
        );
        break;

      case TaskStatus.PAUSED:
        actions.push(
          <Button
            key="resume"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleResume}
            loading={actionLoading}
          >
            继续
          </Button>,
          <Button
            key="cancel"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleCancel}
            loading={actionLoading}
          >
            取消
          </Button>
        );
        break;
    }

    return actions;
  };

  const statusConfig = task ? getStatusConfig(task.status) : null;

  // 日志列表列定义
  const logColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: string) => {
        const colors: Record<string, string> = {
          error: 'red',
          warn: 'orange',
          info: 'blue',
          debug: 'default',
        };
        return <Tag color={colors[level]}>{level.toUpperCase()}</Tag>;
      },
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
    },
  ];

  if (loading || !task) {
    return (
      <Card loading={loading}>
        <div style={{ minHeight: 400 }} />
      </Card>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 页头 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/tasks')}
            >
              返回
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              {task.taskName}
            </Title>
            {statusConfig && (
              <Tag color={statusConfig.color} icon={statusConfig.icon}>
                {statusConfig.text}
              </Tag>
            )}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadTask()}>
              刷新
            </Button>
            {renderActions()}
          </Space>
        </div>

        {/* 基本信息 */}
        <Card title="基本信息">
          <Descriptions column={2}>
            <Descriptions.Item label="任务ID">{task.taskId}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="策略">{task.strategyId}</Descriptions.Item>
            <Descriptions.Item label="数据集">{task.datasetId}</Descriptions.Item>
            <Descriptions.Item label="开始时间">
              {task.startedAt ? dayjs(task.startedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间">
              {task.completedAt ? dayjs(task.completedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            {task.description && (
              <Descriptions.Item label="描述" span={2}>
                {task.description}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* 执行进度 */}
        {task.status === TaskStatus.RUNNING && (
          <Card title="执行进度">
            <Progress
              percent={task.progress || 0}
              status="active"
              format={percent => `${percent}%`}
            />
            {task.currentBar && task.totalBars && (
              <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                处理进度: {task.currentBar} / {task.totalBars} 条数据
              </Text>
            )}
          </Card>
        )}

        {/* 执行配置 */}
        <Card title="执行配置">
          <Descriptions column={2}>
            <Descriptions.Item label="初始资金">
              ¥{task.executionConfig.initialCapital?.toLocaleString() || 0}
            </Descriptions.Item>
            <Descriptions.Item label="手续费率">
              {((task.executionConfig.fee || 0) * 100).toFixed(2)}%
            </Descriptions.Item>
            <Descriptions.Item label="滑点">
              {((task.executionConfig.slippage || 0) * 100).toFixed(2)}%
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 标签页 */}
        <Card>
          <Tabs defaultActiveKey="logs">
            <TabPane tab="执行日志" key="logs">
              <Table
                columns={logColumns}
                dataSource={[]} // TODO: 实现日志加载
                rowKey="logId"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条`,
                }}
              />
            </TabPane>
            <TabPane tab="结果分析" key="results" disabled={task.status !== TaskStatus.COMPLETED}>
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Text type="secondary">任务完成后可查看详细结果</Text>
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </Space>
    </div>
  );
};

