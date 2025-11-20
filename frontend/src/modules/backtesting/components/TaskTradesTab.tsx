import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Button,
  Input,
  Select,
  DatePicker,
  Row,
  Col,
  Statistic,
  Alert,
  Typography,
  Tooltip,
  message,
  Popover,
  List,
} from 'antd';
import {
  DownloadOutlined,
  FilterOutlined,
  ReloadOutlined,
  SwapOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import type { BacktestTask, TaskTradeRecord, TradeExitSegment } from '../../../shared/api/backtestTasks';
import { downloadBacktestTrades, listTaskTrades } from '../../../shared/api/backtestTasks';
import { TradeKLineDrawer } from './TradeKLineDrawer';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface TaskTradesTabProps {
  task: BacktestTask;
}

export const TaskTradesTab: React.FC<TaskTradesTabProps> = ({ task }) => {
  const [loading, setLoading] = useState(false);
  const [trades, setTrades] = useState<TaskTradeRecord[]>([]);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
    showQuickJumper: true,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条记录`,
  });
  const [selectedTrade, setSelectedTrade] = useState<TaskTradeRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [filters, setFilters] = useState({
    keyword: '',
    side: undefined as 'buy' | 'sell' | undefined,
    action: undefined as 'open' | 'close' | 'adjust' | undefined,
    dateRange: undefined as [dayjs.Dayjs, dayjs.Dayjs] | undefined,
  });

  const loadTrades = useCallback(
    async (page = pagination.current || 1, pageSize = pagination.pageSize || 20) => {
      setLoading(true);
      try {
        const response = await listTaskTrades(task.taskId, {
          page,
          pageSize,
        });
        setTrades(response.trades);
        setPagination((prev) => ({
          ...prev,
          current: response.page,
          pageSize: response.pageSize,
          total: response.total,
        }));
      } catch (error: any) {
        console.error('[TaskTradesTab] 加载交易失败', error);
        message.error(error?.message || '加载交易失败');
      } finally {
        setLoading(false);
      }
    },
    [task.taskId, pagination.current, pagination.pageSize],
  );

  useEffect(() => {
    loadTrades(1, pagination.pageSize || 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.taskId]);

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((trade) => (trade.realizedPnl ?? 0) > 0).length;
    const losses = trades.filter((trade) => (trade.realizedPnl ?? 0) < 0).length;
    const totalPnl = trades.reduce((acc, trade) => acc + (trade.realizedPnl ?? 0), 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgWin = wins > 0 ? trades.filter((t) => (t.realizedPnl ?? 0) > 0).reduce((acc, t) => acc + (t.realizedPnl ?? 0), 0) / wins : 0;
    const avgLoss = losses > 0 ? trades.filter((t) => (t.realizedPnl ?? 0) < 0).reduce((acc, t) => acc + Math.abs(t.realizedPnl ?? 0), 0) / losses : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    const totalFees = trades.reduce((acc, trade) => acc + (trade.fees ?? 0), 0);
    return { total, wins, losses, totalPnl, winRate, profitFactor, totalFees };
  }, [trades]);

  const handleRefresh = () => {
    loadTrades(pagination.current || 1, pagination.pageSize || 20);
  };

  const handleExport = async () => {
    try {
      const blob = await downloadBacktestTrades(task.taskId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${task.taskName || task.taskId}-trades.parquet`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('[TaskTradesTab] 下载失败', error);
      message.error(error?.message || '下载交易明细失败');
    }
  };

  const handleViewKline = (tradeRecord: TaskTradeRecord) => {
    setSelectedTrade(tradeRecord);
    setDrawerOpen(true);
  };

  const handleTableChange = (pager: TablePaginationConfig) => {
    const nextPage = pager.current || 1;
    const nextSize = pager.pageSize || 20;
    loadTrades(nextPage, nextSize);
  };

  const handleApplyFilters = () => {
    message.info('筛选功能将在后续版本提供');
  };

  const handleClearFilters = () => {
    setFilters({ keyword: '', side: undefined, action: undefined, dateRange: undefined });
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    take_profit: { label: '止盈', color: 'green' },
    stop_loss: { label: '止损', color: 'red' },
    break_even: { label: '打平', color: 'default' },
    profit: { label: '盈利', color: 'green' },
    loss: { label: '亏损', color: 'red' },
  };

  const renderSegments = (segments?: TradeExitSegment[]) => {
    if (!segments || segments.length === 0) {
      return '-';
    }
    return (
      <Popover
        title="减仓明细"
        content={
          <List
            size="small"
            dataSource={segments}
            renderItem={(item, index) => (
              <List.Item>
                <Space direction="vertical" size={2}>
                  <Text>序号: {index + 1}</Text>
                  <Text>价格: {item.price?.toFixed(4)}</Text>
                  <Text>数量: {item.quantity?.toFixed(4)}</Text>
                  <Text>
                    时间:{' '}
                    {item.timestamp ? dayjs(item.timestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        }
      >
        <Button size="small" type="link">
          {segments.length} 次
        </Button>
      </Popover>
    );
  };

  const columns: ColumnsType<TaskTradeRecord> = [
    {
      title: '交易ID',
      dataIndex: 'tradeId',
      key: 'tradeId',
      width: 140,
      fixed: 'left',
      render: (text) => (
        <Text code style={{ fontSize: 12 }}>
          {text}
        </Text>
      ),
    },
    {
      title: '开仓时间',
      dataIndex: 'entryTimestamp',
      key: 'entryTimestamp',
      width: 180,
      sorter: (a, b) =>
        dayjs(a.entryTimestamp ?? '').unix() - dayjs(b.entryTimestamp ?? '').unix(),
      render: (text) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '平仓时间',
      dataIndex: 'exitTimestamp',
      key: 'exitTimestamp',
      width: 180,
      sorter: (a, b) =>
        dayjs(a.exitTimestamp ?? '').unix() - dayjs(b.exitTimestamp ?? '').unix(),
      render: (text) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '交易对',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      width: 80,
      render: (side: TaskTradeRecord['side']) => (
        <Tag color={side === 'buy' ? 'green' : 'red'}>{side === 'buy' ? '做多' : '做空'}</Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (value) => (value ? value.toFixed(4) : '-'),
    },
    {
      title: '入场价',
      dataIndex: 'entryPrice',
      key: 'entryPrice',
      width: 120,
      align: 'right',
      render: (value) =>
        value !== undefined && value !== null
          ? value.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '-',
    },
    {
      title: '出场价',
      dataIndex: 'exitPrice',
      key: 'exitPrice',
      width: 120,
      align: 'right',
      render: (value) =>
        value !== undefined && value !== null
          ? value.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (_, record) => {
        const status = record.status || record.context?.status;
        if (!status) return '-';
        const info = statusLabels[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '盈亏',
      dataIndex: 'realizedPnl',
      key: 'realizedPnl',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.realizedPnl || 0) - (b.realizedPnl || 0),
      render: (value) => {
        if (value === undefined || value === null) return '-';
        return (
          <Space>
            <Text style={{ color: value > 0 ? '#389e0d' : value < 0 ? '#cf1322' : undefined }}>
              {value.toFixed(2)}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '手续费',
      dataIndex: 'fees',
      key: 'fees',
      width: 120,
      align: 'right',
      render: (value) => (value ? value.toFixed(4) : '-'),
    },
    {
      title: '因子快照',
      dataIndex: 'factorSnapshot',
      key: 'factorSnapshot',
      width: 160,
      render: (value) => {
        if (!value || (!value.system && !value.custom)) return '-';
        return (
          <Tooltip
            title={
              <div>
                {value.system && (
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>系统因子</Text>
                    <pre style={{ margin: 0 }}>{JSON.stringify(value.system, null, 2)}</pre>
                  </div>
                )}
                {value.custom && (
                  <div>
                    <Text strong>自定义因子</Text>
                    <pre style={{ margin: 0 }}>{JSON.stringify(value.custom, null, 2)}</pre>
                  </div>
                )}
              </div>
            }
          >
            <Text type="secondary">查看因子</Text>
          </Tooltip>
        );
      },
    },
    {
      title: '减仓分段',
      key: 'segments',
      width: 120,
      render: (_, record) => renderSegments(record.exitSegments),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Button size="small" onClick={() => handleViewKline(record)}>
          查看K线
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {task.status !== 'completed' && (
        <Card>
          <Alert
            message="提示"
            description="任务尚未完成，当前展示为最新的交易快照。"
            type="info"
            showIcon
          />
        </Card>
      )}

      <Card>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="总交易数" value={stats.total} prefix={<SwapOutlined />} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="胜率"
              value={stats.winRate}
              precision={2}
              suffix="%"
              prefix={<RiseOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="累计盈亏"
              value={stats.totalPnl}
              precision={2}
              prefix={<FallOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="Profit Factor"
              value={stats.profitFactor}
              precision={2}
              prefix="PF"
            />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="胜场" value={stats.wins} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="败场" value={stats.losses} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic title="总手续费" value={stats.totalFees} precision={4} />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16}>
            <Col span={6}>
              <Input
                placeholder="搜索交易对或ID"
                prefix={<FilterOutlined />}
                value={filters.keyword}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                allowClear
              />
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="交易方向"
                value={filters.side}
                onChange={(value) => setFilters({ ...filters, side: value })}
                allowClear
                options={[
                  { label: '做多', value: 'buy' },
                  { label: '做空', value: 'sell' },
                ]}
              />
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="交易状态"
                value={filters.action}
                onChange={(value) => setFilters({ ...filters, action: value })}
                allowClear
                options={[
                  { label: '止盈', value: 'take_profit' },
                  { label: '止损', value: 'stop_loss' },
                  { label: '打平', value: 'break_even' },
                ]}
              />
            </Col>
            <Col span={6}>
              <RangePicker
                style={{ width: '100%' }}
                value={filters.dateRange}
                onChange={(dates) =>
                  setFilters({
                    ...filters,
                    dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | undefined,
                  })
                }
                showTime
              />
            </Col>
            <Col span={4}>
              <Space>
                <Button onClick={handleClearFilters}>清空</Button>
                <Button icon={<SwapOutlined />} type="primary" onClick={handleApplyFilters}>
                  应用筛选
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={16} justify="space-between">
            <Col>
              <Text type="secondary">更高级的交易筛选将于后续版本提供。</Text>
            </Col>
            <Col>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
                  刷新
                </Button>
                <Button icon={<DownloadOutlined />} type="primary" onClick={handleExport}>
                  下载Parquet
                </Button>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={trades}
          rowKey="tradeId"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1500, y: 600 }}
          size="small"
        />
      </Card>

      <TradeKLineDrawer
        task={task}
        trade={selectedTrade}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTrade(null);
        }}
      />
    </Space>
  );
};

export default TaskTradesTab;
