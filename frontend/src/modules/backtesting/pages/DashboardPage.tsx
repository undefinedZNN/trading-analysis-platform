import { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Space,
  Button,
  Alert,
  Spin,
  Empty,
  Typography,
} from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  BarChartOutlined,
  DashboardOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { Line, Column } from '@ant-design/plots';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchTaskStatistics,
  fetchWorkerList,
  fetchRecentTasks,
  fetchTaskTrend,
  type TaskStatistics as ApiTaskStatistics,
  type WorkerStatus as ApiWorkerStatus,
  type RecentTask as ApiRecentTask,
  type TrendData as ApiTrendData,
} from '../../../shared/api/backtesting';

const { Title, Text } = Typography;

// 类型定义
interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
  averageExecutionTime: number | null;
}

interface WorkerStatus {
  workerId: string;
  status: string;
  currentLoad: number;
  maxLoad: number;
  healthy: boolean;
  lastHeartbeat: string;
}

interface RecentTask {
  taskId: string;
  taskName: string;
  strategyName: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  duration?: number;
}

interface TrendData {
  date: string;
  completed: number;
  failed: number;
}

/**
 * 仪表盘页面
 * 
 * 展示回测系统的整体状况，包括：
 * - 任务统计
 * - 执行趋势
 * - Worker状态
 * - 最近任务
 */
export const DashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<TaskStatistics | null>(null);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载所有数据
      const [stats, workers, tasks, trend] = await Promise.all([
        fetchTaskStatistics(),
        fetchWorkerList().catch(() => [] as ApiWorkerStatus[]), // Worker可能未启动，使用空数组
        fetchRecentTasks(10).catch(() => [] as ApiRecentTask[]), // 最近10个任务
        fetchTaskTrend(7, 'day').catch(() => [] as ApiTrendData[]), // 最近7天趋势
      ]);

      // 设置统计数据
      setStatistics(stats);

      // 转换Worker数据格式
      const now = Date.now();
      const formattedWorkers: WorkerStatus[] = workers.map((w) => ({
        workerId: w.workerId,
        status: w.status,
        currentLoad: w.currentLoad,
        maxLoad: w.capabilities.maxConcurrentTasks,
        healthy: now - w.lastHeartbeat < 30000 && w.status !== 'down',
        lastHeartbeat: new Date(w.lastHeartbeat).toISOString(),
      }));
      setWorkers(formattedWorkers);

      // 转换最近任务数据格式
      const formattedTasks: RecentTask[] = tasks.map((task) => {
        let duration: number | undefined;
        if (task.startedAt && task.completedAt) {
          duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
        }
        
        return {
          taskId: task.taskId,
          taskName: task.taskName,
          strategyName: task.strategyName || '未知策略',
          status: task.status,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          duration,
        };
      });
      setRecentTasks(formattedTasks);

      // 转换趋势数据格式（用于图表）
      const formattedTrend: TrendData[] = trend.map((item) => ({
        date: dayjs(item.date).format('MM-DD'),
        completed: item.completed,
        failed: item.failed,
      }));
      setTrendData(formattedTrend);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // 设置自动刷新（每30秒）
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  // 状态标签
  const getStatusTag = (status: string) => {
    const statusConfig: Record<
      string,
      { color: string; text: string; icon: React.ReactNode }
    > = {
      pending: {
        color: 'default',
        text: '待执行',
        icon: <ClockCircleOutlined />,
      },
      running: {
        color: 'processing',
        text: '执行中',
        icon: <LoadingOutlined />,
      },
      completed: {
        color: 'success',
        text: '已完成',
        icon: <CheckCircleOutlined />,
      },
      failed: {
        color: 'error',
        text: '失败',
        icon: <CloseCircleOutlined />,
      },
      cancelled: {
        color: 'default',
        text: '已取消',
        icon: <CloseCircleOutlined />,
      },
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // Worker状态标签
  const getWorkerStatusTag = (status: string, healthy: boolean) => {
    if (!healthy) {
      return <Tag color="error">异常</Tag>;
    }

    const statusConfig: Record<string, { color: string; text: string }> = {
      idle: { color: 'default', text: '空闲' },
      busy: { color: 'processing', text: '忙碌' },
      overloaded: { color: 'warning', text: '过载' },
      down: { color: 'error', text: '离线' },
    };

    const config = statusConfig[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 格式化时长
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // 最近任务表格列定义
  const recentTasksColumns: ColumnsType<RecentTask> = [
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 200,
      render: (text, record) => (
        <a onClick={() => navigate(`/backtesting/tasks/${record.taskId}`)}>
          {text}
        </a>
      ),
    },
    {
      title: '策略',
      dataIndex: 'strategyName',
      key: 'strategyName',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => getStatusTag(status),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '执行时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 120,
      render: (duration) => formatDuration(duration),
    },
  ];

  // Worker表格列定义
  const workerColumns: ColumnsType<WorkerStatus> = [
    {
      title: 'Worker ID',
      dataIndex: 'workerId',
      key: 'workerId',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status, record) => getWorkerStatusTag(status, record.healthy),
    },
    {
      title: '负载',
      key: 'load',
      width: 150,
      render: (_, record) => (
        <Space>
          <Text>
            {record.currentLoad}/{record.maxLoad}
          </Text>
          <Text type="secondary">
            ({Math.round((record.currentLoad / record.maxLoad) * 100)}%)
          </Text>
        </Space>
      ),
    },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 160,
      render: (date) => dayjs(date).format('HH:mm:ss'),
    },
  ];

  // 趋势图表配置
  const trendConfig = {
    data: trendData,
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    isStack: false,
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    legend: {
      position: 'top' as const,
    },
    color: ['#52c41a', '#ff4d4f'],
  };

  // 转换趋势数据为图表格式
  const chartData = trendData.flatMap((item) => [
    { date: item.date, value: item.completed, type: '成功' },
    { date: item.date, value: item.failed, type: '失败' },
  ]);

  // 每日任务量柱状图配置
  const columnConfig = {
    data: trendData.map((item) => ({
      date: item.date,
      value: item.completed + item.failed,
    })),
    xField: 'date',
    yField: 'value',
    color: '#1890ff',
    label: {
      position: 'top' as const,
      style: {
        fill: '#000000',
        opacity: 0.6,
      },
    },
    meta: {
      value: {
        alias: '任务数',
      },
    },
  };

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="加载失败"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={loadData}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (loading || !statistics) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" tip="加载仪表盘数据..." />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <DashboardOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <Title level={2} style={{ margin: 0 }}>
            回测系统仪表盘
          </Title>
        </Space>
        <Text type="secondary" style={{ marginLeft: 34 }}>
          实时监控回测任务执行状况和系统状态
        </Text>
      </div>

      {/* 刷新按钮 */}
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="总任务数"
              value={statistics.total}
              prefix={<ThunderboltOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="待执行"
              value={statistics.pending}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="执行中"
              value={statistics.running}
              prefix={<LoadingOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="已完成"
              value={statistics.completed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="失败"
              value={statistics.failed}
              prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={4}>
          <Card>
            <Statistic
              title="成功率"
              value={statistics.successRate || 0}
              suffix="%"
              precision={2}
              prefix={<BarChartOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="执行趋势（最近7天）" bordered={false}>
            <Line {...trendConfig} data={chartData} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="每日任务量" bordered={false}>
            <Column {...columnConfig} height={300} />
          </Card>
        </Col>
      </Row>

      {/* Worker状态 */}
      <Card
        title={
          <Space>
            <CloudServerOutlined />
            <span>Worker 状态</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Text type="secondary">
              在线: {workers.filter((w) => w.healthy).length}/{workers.length}
            </Text>
          </Space>
        }
      >
        {workers.length === 0 ? (
          <Empty description="暂无Worker节点" />
        ) : (
          <Table
            columns={workerColumns}
            dataSource={workers}
            rowKey="workerId"
            pagination={false}
            size="small"
          />
        )}
      </Card>

      {/* 最近任务 */}
      <Card
        title="最近任务"
        extra={
          <Button
            type="link"
            onClick={() => navigate('/backtesting/tasks')}
          >
            查看全部
          </Button>
        }
      >
        {recentTasks.length === 0 ? (
          <Empty description="暂无任务" />
        ) : (
          <Table
            columns={recentTasksColumns}
            dataSource={recentTasks}
            rowKey="taskId"
            pagination={false}
            size="middle"
          />
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;

