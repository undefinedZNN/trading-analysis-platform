import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Input,
  Select,
  Button,
  Space,
  Spin,
  Empty,
  Pagination,
  message,
  Card,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import {
  listBacktestTasks,
  fetchTaskStatistics,
  type BacktestTask,
  type TaskStatistics,
  BacktestTaskStatus,
  SortField,
  SortOrder,
} from '../../../api/tasks-adapter';
import { BacktestTaskCard } from '../components/BacktestTaskCard';
import { TaskStatisticsCards } from '../components/TaskStatisticsCards';
import { CreateBacktestTaskModal } from '../components/CreateBacktestTaskModal';
import { listDatasets, type DatasetDto } from '../../../shared/api/tradingData';
import { useNavigate } from 'react-router-dom';

const { Search } = Input;

/**
 * 回测任务列表页面
 */
export const BacktestTaskListPage: React.FC = () => {
  const navigate = useNavigate();
  const logEvent = (message: string, payload?: unknown) => {
    if (payload !== undefined) {
      console.info(`[BacktestTasks] ${message}`, payload);
    } else {
      console.info(`[BacktestTasks] ${message}`);
    }
  };
  
  // 状态管理
  const [tasks, setTasks] = useState<BacktestTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  
  // 统计信息
  const [statistics, setStatistics] = useState<TaskStatistics | undefined>();
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsError, setStatisticsError] = useState<Error | null>(null);
  
  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<BacktestTaskStatus | undefined>();
  const [sortBy, setSortBy] = useState<SortField>(SortField.CREATED_AT);
  const [sortOrder, setSortOrder] = useState<SortOrder>(SortOrder.DESC);
  
  // 数据集列表
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  
  // 创建任务模态框
  const [createModalOpen, setCreateModalOpen] = useState(false);

  /**
   * 加载任务统计
   */
  const loadStatistics = async () => {
    try {
      setStatisticsLoading(true);
      setStatisticsError(null);
      logEvent('开始加载任务统计');
      const stats = await fetchTaskStatistics();
      setStatistics(stats);
      logEvent('任务统计加载完成', stats);
    } catch (error: any) {
      console.error('[BacktestTasks] 加载任务统计失败', error);
      setStatisticsError(error);
      // 不显示错误消息，由组件内部处理
    } finally {
      setStatisticsLoading(false);
    }
  };

  /**
   * 加载任务列表
   */
  const loadTasks = async () => {
    try {
      setLoading(true);
      logEvent('开始加载任务列表', {
        keyword,
        statusFilter,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      const response = await listBacktestTasks({
        keyword: keyword || undefined,
        status: statusFilter,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      
      setTasks(response.tasks);
      setTotal(response.total);
      logEvent('任务列表加载完成', {
        count: response.tasks.length,
        total: response.total,
      });
    } catch (error: any) {
      console.error('[BacktestTasks] 加载任务列表失败', error);
      message.error('加载任务列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载数据集列表
   */
  const loadDatasets = async () => {
    try {
      logEvent('开始加载数据集列表');
      const response = await listDatasets({ pageSize: 100 });  // 使用合理的限制
      setDatasets(response.items);
      logEvent('数据集列表加载完成', { count: response.items.length });
    } catch (error: any) {
      console.error('[BacktestTasks] 加载数据集列表失败', error);
      message.error('加载数据集列表失败: ' + error.message);
    }
  };

  /**
   * 初始加载数据集和统计信息
   */
  useEffect(() => {
    loadDatasets();
    loadStatistics();
  }, []);

  /**
   * 初始加载和条件变化时重新加载
   */
  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter, sortBy, sortOrder]);

  /**
   * 搜索
   */
  const handleSearch = () => {
    logEvent('执行任务搜索', { keyword });
    setPage(1); // 重置到第一页
    loadTasks();
  };

  /**
   * 重置筛选
   */
  const handleReset = () => {
    logEvent('重置任务筛选条件');
    setKeyword('');
    setStatusFilter(undefined);
    setSortBy(SortField.CREATED_AT);
    setSortOrder(SortOrder.DESC);
    setPage(1);
  };

  /**
   * 查看任务详情
   */
  const handleViewTask = (taskId: string) => {
    logEvent('跳转查看任务详情', { taskId });
    navigate(`/backtesting/tasks/${taskId}`);
  };

  /**
   * 创建任务成功后的回调
   */
  const handleCreateSuccess = () => {
    logEvent('任务创建成功刷新列表');
    setCreateModalOpen(false);
    setPage(1);
    loadTasks();
    loadStatistics(); // 刷新统计信息
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
              回测任务
            </h1>
            <p style={{ margin: '8px 0 0 0', color: '#999' }}>
              管理和监控您的策略回测任务
            </p>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            创建任务
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <TaskStatisticsCards
        statistics={statistics}
        loading={statisticsLoading}
        error={statisticsError}
        onRefresh={loadStatistics}
      />

      {/* 筛选和搜索 */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={[16, 16]}>
            <Col flex="auto">
              <Search
                placeholder="搜索任务名称或描述"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onSearch={handleSearch}
                enterButton={<SearchOutlined />}
                allowClear
                size="large"
              />
            </Col>
            <Col>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadTasks}
                loading={loading}
                size="large"
              >
                刷新
              </Button>
            </Col>
          </Row>

          <Row gutter={[16, 16]} align="middle">
            <Col>
              <FilterOutlined style={{ marginRight: 8, color: '#999' }} />
              <span style={{ color: '#999' }}>筛选:</span>
            </Col>
            <Col>
              <Select
                style={{ width: 150 }}
                placeholder="状态"
                value={statusFilter}
                onChange={setStatusFilter}
                allowClear
                options={[
                  { label: '待执行', value: BacktestTaskStatus.PENDING },
                  { label: '执行中', value: BacktestTaskStatus.RUNNING },
                  { label: '已完成', value: BacktestTaskStatus.COMPLETED },
                  { label: '失败', value: BacktestTaskStatus.FAILED },
                  { label: '已取消', value: BacktestTaskStatus.CANCELLED },
                ]}
              />
            </Col>
            <Col>
              <Select
                style={{ width: 150 }}
                placeholder="排序字段"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { label: '创建时间', value: SortField.CREATED_AT },
                  { label: '开始时间', value: SortField.STARTED_AT },
                  { label: '完成时间', value: SortField.COMPLETED_AT },
                  { label: '任务名称', value: SortField.TASK_NAME },
                ]}
              />
            </Col>
            <Col>
              <Select
                style={{ width: 120 }}
                value={sortOrder}
                onChange={setSortOrder}
                options={[
                  { label: '降序', value: SortOrder.DESC },
                  { label: '升序', value: SortOrder.ASC },
                ]}
              />
            </Col>
            <Col>
              <Button onClick={handleReset}>
                重置
              </Button>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 任务列表 */}
      <Spin spinning={loading}>
        {tasks.length === 0 ? (
          <Empty
            description="暂无回测任务"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '60px 0' }}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              创建第一个任务
            </Button>
          </Empty>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              {tasks.map((task) => (
                <Col
                  key={task.taskId}
                  xs={24}
                  sm={24}
                  md={12}
                  lg={8}
                  xl={6}
                >
                  <BacktestTaskCard
                    task={task}
                    onView={handleViewTask}
                    onUpdate={loadTasks}
                  />
                </Col>
              ))}
            </Row>

            {/* 分页 */}
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={(newPage, newPageSize) => {
                  setPage(newPage);
                  setPageSize(newPageSize);
                }}
                showSizeChanger
                showQuickJumper
                showTotal={(total) => `共 ${total} 个任务`}
                pageSizeOptions={[12, 24, 48, 96]}
              />
            </div>
          </>
        )}
      </Spin>

      {/* 创建任务模态框 */}
      <CreateBacktestTaskModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        datasets={datasets.map((d) => ({
          datasetId: d.datasetId,
          name: `${d.source || ''}-${d.tradingPair}-${d.granularity}`.trim(),
          tradingPair: d.tradingPair,
          granularity: d.granularity,
          timeStart: d.timeStart,
          timeEnd: d.timeEnd,
          rowCount: d.rowCount,
        }))}
      />
    </div>
  );
};

export default BacktestTaskListPage;
