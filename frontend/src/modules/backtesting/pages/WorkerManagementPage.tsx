import { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Space,
  Button,
  Alert,
  Spin,
  Typography,
  Statistic,
  Progress,
  message,
  Modal,
  Descriptions,
  Tooltip,
  Empty,
} from 'antd';
import {
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  DashboardOutlined,
  ApiOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Line } from '@ant-design/plots';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchWorkerList,
  fetchWorker,
  startWorker,
  stopWorker,
  checkWorkerHealth,
  fetchWorkerMetrics,
  type WorkerStatus,
} from '../../../shared/api/backtesting';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title, Text } = Typography;

interface WorkerMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  taskCount?: number;
  responseTime?: number[];
}

/**
 * Worker管理页面
 * 
 * 提供Worker节点的监控和管理功能：
 * - Worker列表和状态监控
 * - 启动/停止控制
 * - 性能指标展示
 * - 健康状态检查
 */
export const WorkerManagementPage = () => {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<WorkerStatus | null>(null);
  const [workerMetrics, setWorkerMetrics] = useState<WorkerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 加载Worker列表
  const loadWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWorkerList();
      setWorkers(data);
    } catch (err) {
      console.error('Failed to load workers:', err);
      setError(err instanceof Error ? err.message : '加载Worker列表失败');
      message.error('加载Worker列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载Worker详情和指标
  const loadWorkerDetail = async (workerId: string) => {
    try {
      const [detail, metrics] = await Promise.all([
        fetchWorker(workerId),
        fetchWorkerMetrics(workerId).catch(() => null),
      ]);
      
      setSelectedWorker(detail);
      setWorkerMetrics(metrics);
      setDetailModalVisible(true);
    } catch (err) {
      console.error('Failed to load worker detail:', err);
      message.error('加载Worker详情失败');
    }
  };

  // 启动Worker
  const handleStartWorker = async (workerId: string) => {
    try {
      message.loading({ content: '正在启动Worker...', key: 'start' });
      await startWorker(workerId);
      message.success({ content: 'Worker启动成功', key: 'start', duration: 2 });
      loadWorkers();
    } catch (err) {
      message.error({
        content: `启动失败: ${err instanceof Error ? err.message : '未知错误'}`,
        key: 'start',
        duration: 3,
      });
    }
  };

  // 停止Worker
  const handleStopWorker = async (workerId: string, workerName: string) => {
    Modal.confirm({
      title: '确认停止Worker',
      content: `确定要停止 ${workerName} 吗？正在执行的任务将被中断。`,
      okText: '确定停止',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          message.loading({ content: '正在停止Worker...', key: 'stop' });
          await stopWorker(workerId);
          message.success({ content: 'Worker已停止', key: 'stop', duration: 2 });
          loadWorkers();
        } catch (err) {
          message.error({
            content: `停止失败: ${err instanceof Error ? err.message : '未知错误'}`,
            key: 'stop',
            duration: 3,
          });
        }
      },
    });
  };

  // 健康检查
  const handleHealthCheck = async (workerId: string) => {
    try {
      message.loading({ content: '正在检查健康状态...', key: 'health' });
      const result = await checkWorkerHealth(workerId);
      
      if (result.healthy) {
        message.success({
          content: `Worker健康状态良好 (负载: ${result.currentLoad}/${result.maxLoad})`,
          key: 'health',
          duration: 3,
        });
      } else {
        message.warning({
          content: `Worker状态异常: ${result.status}`,
          key: 'health',
          duration: 3,
        });
      }
      
      loadWorkers();
    } catch (err) {
      message.error({
        content: `健康检查失败: ${err instanceof Error ? err.message : '未知错误'}`,
        key: 'health',
        duration: 3,
      });
    }
  };

  useEffect(() => {
    loadWorkers();

    // 设置自动刷新（每30秒）
    const timer = setInterval(loadWorkers, 30000);
    return () => clearInterval(timer);
  }, []);

  // 状态标签
  const getStatusTag = (status: string, healthy: boolean) => {
    if (!healthy) {
      return <Tag color="error">离线</Tag>;
    }

    const statusMap: Record<string, { color: string; text: string }> = {
      idle: { color: 'success', text: '空闲' },
      busy: { color: 'processing', text: '忙碌' },
      overloaded: { color: 'warning', text: '过载' },
      down: { color: 'error', text: '停机' },
    };

    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 健康状态图标
  const getHealthIcon = (healthy: boolean) => {
    return healthy ? (
      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
    ) : (
      <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
    );
  };

  // Worker表格列定义
  const columns: ColumnsType<WorkerStatus> = [
    {
      title: '健康状态',
      key: 'healthy',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const now = Date.now();
        const healthy = now - record.lastHeartbeat < 60000 && record.status !== 'down';
        return getHealthIcon(healthy);
      },
    },
    {
      title: 'Worker ID',
      dataIndex: 'workerId',
      key: 'workerId',
      width: 200,
      render: (id: string) => (
        <Text code copyable>
          {id}
        </Text>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => {
        const now = Date.now();
        const healthy = now - record.lastHeartbeat < 60000 && record.status !== 'down';
        return getStatusTag(record.status, healthy);
      },
    },
    {
      title: '负载',
      key: 'load',
      width: 150,
      render: (_, record) => {
        const percent = (record.currentLoad / record.capabilities.maxConcurrentTasks) * 100;
        const status = percent >= 100 ? 'exception' : percent >= 80 ? 'active' : 'normal';
        
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Text style={{ fontSize: 12 }}>
              {record.currentLoad} / {record.capabilities.maxConcurrentTasks}
            </Text>
            <Progress
              percent={Math.min(percent, 100)}
              size="small"
              status={status}
              showInfo={false}
            />
          </Space>
        );
      },
    },
    {
      title: '地址',
      key: 'baseUrl',
      dataIndex: 'baseUrl',
      width: 200,
    },
    {
      title: '最后心跳',
      key: 'lastHeartbeat',
      width: 150,
      render: (_, record) => {
        const heartbeatTime = dayjs(record.lastHeartbeat);
        const now = dayjs();
        const diffSeconds = now.diff(heartbeatTime, 'second');
        
        if (diffSeconds < 60) {
          return (
            <Space>
              <ClockCircleOutlined style={{ color: '#52c41a' }} />
              <Text>{heartbeatTime.fromNow()}</Text>
            </Space>
          );
        } else if (diffSeconds < 300) {
          return (
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <Text type="warning">{heartbeatTime.fromNow()}</Text>
            </Space>
          );
        } else {
          return (
            <Space>
              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
              <Text type="danger">{heartbeatTime.fromNow()}</Text>
            </Space>
          );
        }
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const now = Date.now();
        const healthy = now - record.lastHeartbeat < 60000;
        
        return (
          <Space size="small">
            <Tooltip title="查看详情">
              <Button
                type="link"
                size="small"
                icon={<DashboardOutlined />}
                onClick={() => loadWorkerDetail(record.workerId)}
              >
                详情
              </Button>
            </Tooltip>
            
            <Tooltip title="健康检查">
              <Button
                type="link"
                size="small"
                icon={<ApiOutlined />}
                onClick={() => handleHealthCheck(record.workerId)}
                disabled={!healthy}
              >
                检查
              </Button>
            </Tooltip>
            
            {record.status === 'down' || !healthy ? (
              <Tooltip title="启动Worker">
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleStartWorker(record.workerId)}
                >
                  启动
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="停止Worker">
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={() => handleStopWorker(record.workerId, record.workerId)}
                >
                  停止
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  // 计算统计数据
  const stats = {
    total: workers.length,
    healthy: workers.filter(w => {
      const now = Date.now();
      return now - w.lastHeartbeat < 60000 && w.status !== 'down';
    }).length,
    busy: workers.filter(w => w.status === 'busy').length,
    idle: workers.filter(w => w.status === 'idle').length,
  };

  // 渲染性能图表
  const renderMetricsChart = () => {
    if (!workerMetrics || !workerMetrics.responseTime) {
      return <Empty description="暂无性能数据" />;
    }

    const data = workerMetrics.responseTime.map((value, index) => ({
      time: `T-${workerMetrics.responseTime!.length - index}`,
      value,
    }));

    const config = {
      data,
      xField: 'time',
      yField: 'value',
      smooth: true,
      animation: {
        appear: {
          animation: 'wave-in',
          duration: 1000,
        },
      },
      yAxis: {
        title: {
          text: '响应时间 (ms)',
        },
      },
    };

    return <Line {...config} />;
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Worker管理</Title>
        <Text type="secondary">监控和管理回测Worker节点</Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总Worker数"
              value={stats.total}
              prefix={<ApiOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="健康Worker"
              value={stats.healthy}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="忙碌Worker"
              value={stats.busy}
              valueStyle={{ color: '#1890ff' }}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="空闲Worker"
              value={stats.idle}
              valueStyle={{ color: '#52c41a' }}
              prefix={<PauseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 错误提示 */}
      {error && (
        <Alert
          type="error"
          message="加载失败"
          description={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Worker列表 */}
      <Card
        title="Worker列表"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={loadWorkers}
            loading={loading}
          >
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={workers}
          rowKey="workerId"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个Worker`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Worker详情Modal */}
      <Modal
        title={`Worker详情 - ${selectedWorker?.workerId || ''}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedWorker(null);
          setWorkerMetrics(null);
        }}
        footer={null}
        width={800}
      >
        {selectedWorker && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* 基本信息 */}
            <Card title="基本信息" size="small">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Worker ID">
                  {selectedWorker.workerId}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {getStatusTag(
                    selectedWorker.status,
                    Date.now() - selectedWorker.lastHeartbeat < 60000
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="地址">
                  {selectedWorker.baseUrl}
                </Descriptions.Item>
                <Descriptions.Item label="当前负载">
                  {selectedWorker.currentLoad} /{' '}
                  {selectedWorker.capabilities.maxConcurrentTasks}
                </Descriptions.Item>
                <Descriptions.Item label="注册时间">
                  {dayjs(selectedWorker.registeredAt).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label="最后心跳">
                  {dayjs(selectedWorker.lastHeartbeat).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 性能指标 */}
            {workerMetrics && (
              <Card title="性能指标" size="small">
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="CPU使用率"
                      value={workerMetrics.cpuUsage || 0}
                      precision={1}
                      suffix="%"
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="内存使用率"
                      value={workerMetrics.memoryUsage || 0}
                      precision={1}
                      suffix="%"
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="任务数"
                      value={workerMetrics.taskCount || 0}
                    />
                  </Col>
                </Row>
              </Card>
            )}

            {/* 响应时间趋势 */}
            {workerMetrics && workerMetrics.responseTime && (
              <Card title="响应时间趋势" size="small">
                {renderMetricsChart()}
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

