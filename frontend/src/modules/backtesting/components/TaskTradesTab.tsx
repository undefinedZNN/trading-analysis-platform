import React, { useState } from 'react';
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
import type { BacktestTask } from '../../../shared/api/backtestTasks';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * 交易记录接口
 * TODO: 后续从后端API获取实际数据
 */
interface TradeRecord {
  tradeId: string;
  timestamp: string;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  quantity: number;
  price: number;
  pnl?: number;
  pnlPercent?: number;
  commission: number;
  factors?: Record<string, any>;
}

interface TaskTradesTabProps {
  task: BacktestTask;
}

/**
 * 交易明细Tab组件
 * 展示回测任务的所有交易记录
 */
export const TaskTradesTab: React.FC<TaskTradesTabProps> = ({ task }) => {
  const [loading, setLoading] = useState(false);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total) => `共 ${total} 条记录`,
  });

  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    side: undefined as 'long' | 'short' | undefined,
    action: undefined as 'open' | 'close' | undefined,
    dateRange: undefined as [dayjs.Dayjs, dayjs.Dayjs] | undefined,
  });

  /**
   * 生成模拟交易数据
   * TODO: 后续从后端API获取实际数据
   */
  const generateMockTrades = (): TradeRecord[] => {
    if (!task.resultSummary) return [];

    const { totalTrades, initialCapital } = task.resultSummary
      ? { totalTrades: task.resultSummary.totalTrades, initialCapital: task.executionConfig.initialCapital }
      : { totalTrades: 0, initialCapital: 0 };

    const mockTrades: TradeRecord[] = [];
    const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT'];

    for (let i = 0; i < Math.min(totalTrades, 100); i++) {
      const side = Math.random() > 0.5 ? 'long' : 'short';
      const action = i % 2 === 0 ? 'open' : 'close';
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const price = 30000 + Math.random() * 10000;
      const quantity = Math.random() * 0.1;
      const commission = price * quantity * 0.001;

      // 计算盈亏（仅平仓时）
      let pnl: number | undefined;
      let pnlPercent: number | undefined;
      if (action === 'close') {
        const entryPrice = price * (0.95 + Math.random() * 0.1);
        pnl = side === 'long' 
          ? (price - entryPrice) * quantity - commission
          : (entryPrice - price) * quantity - commission;
        pnlPercent = (pnl / (entryPrice * quantity)) * 100;
      }

      mockTrades.push({
        tradeId: `trade-${i + 1}`,
        timestamp: dayjs(task.dataConfig.timeRange.start)
          .add(i * 10, 'minute')
          .toISOString(),
        symbol,
        side,
        action,
        quantity,
        price,
        pnl,
        pnlPercent,
        commission,
        factors: {
          rsi: (Math.random() * 100).toFixed(2),
          macd: (Math.random() * 10 - 5).toFixed(2),
          volume: (Math.random() * 1000000).toFixed(0),
        },
      });
    }

    return mockTrades;
  };

  /**
   * 加载交易数据
   */
  const loadTrades = () => {
    setLoading(true);

    // 模拟API调用延迟
    setTimeout(() => {
      const mockData = generateMockTrades();
      setTrades(mockData);
      setPagination({
        ...pagination,
        total: mockData.length,
      });
      setLoading(false);
    }, 500);
  };

  /**
   * 初始加载
   */
  React.useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.taskId]);

  /**
   * 表格列定义
   */
  const columns: ColumnsType<TradeRecord> = [
    {
      title: '交易ID',
      dataIndex: 'tradeId',
      key: 'tradeId',
      width: 120,
      fixed: 'left',
      render: (text) => (
        <Text code style={{ fontSize: 12 }}>
          {text}
        </Text>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      sorter: (a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '交易对',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      filters: [
        { text: 'BTC/USDT', value: 'BTC/USDT' },
        { text: 'ETH/USDT', value: 'ETH/USDT' },
        { text: 'BNB/USDT', value: 'BNB/USDT' },
      ],
      onFilter: (value, record) => record.symbol === value,
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      width: 80,
      filters: [
        { text: '做多', value: 'long' },
        { text: '做空', value: 'short' },
      ],
      onFilter: (value, record) => record.side === value,
      render: (side: 'long' | 'short') => (
        <Tag color={side === 'long' ? 'green' : 'red'}>
          {side === 'long' ? '做多' : '做空'}
        </Tag>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      filters: [
        { text: '开仓', value: 'open' },
        { text: '平仓', value: 'close' },
      ],
      onFilter: (value, record) => record.action === value,
      render: (action: 'open' | 'close') => (
        <Tag color={action === 'open' ? 'cyan' : 'orange'}>
          {action === 'open' ? '开仓' : '平仓'}
        </Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.quantity - b.quantity,
      render: (value) => value.toFixed(4),
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.price - b.price,
      render: (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.pnl || 0) - (b.pnl || 0),
      render: (value) => {
        if (value === undefined) return '-';
        return (
          <Space>
            <Text
              style={{
                color: value >= 0 ? '#3f8600' : '#cf1322',
                fontWeight: 'bold',
              }}
            >
              {value >= 0 ? '+' : ''}${value.toFixed(2)}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '收益率',
      dataIndex: 'pnlPercent',
      key: 'pnlPercent',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.pnlPercent || 0) - (b.pnlPercent || 0),
      render: (value) => {
        if (value === undefined) return '-';
        return (
          <Space>
            {value >= 0 ? (
              <RiseOutlined style={{ color: '#3f8600' }} />
            ) : (
              <FallOutlined style={{ color: '#cf1322' }} />
            )}
            <Text
              style={{
                color: value >= 0 ? '#3f8600' : '#cf1322',
                fontWeight: 'bold',
              }}
            >
              {value >= 0 ? '+' : ''}{value.toFixed(2)}%
            </Text>
          </Space>
        );
      },
    },
    {
      title: '手续费',
      dataIndex: 'commission',
      key: 'commission',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.commission - b.commission,
      render: (value) => `$${value.toFixed(4)}`,
    },
    {
      title: '因子',
      key: 'factors',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Tooltip
          title={
            <div>
              {record.factors &&
                Object.entries(record.factors).map(([key, value]) => (
                  <div key={key}>
                    {key}: {value}
                  </div>
                ))}
            </div>
          }
        >
          <Button type="link" size="small">
            查看 ({Object.keys(record.factors || {}).length})
          </Button>
        </Tooltip>
      ),
    },
  ];

  /**
   * 计算交易统计
   */
  const calculateStats = () => {
    const totalPnL = trades
      .filter((t) => t.pnl !== undefined)
      .reduce((sum, t) => sum + (t.pnl || 0), 0);

    const profitTrades = trades.filter((t) => t.pnl && t.pnl > 0).length;
    const lossTrades = trades.filter((t) => t.pnl && t.pnl < 0).length;
    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);

    return { totalPnL, profitTrades, lossTrades, totalCommission };
  };

  const stats = calculateStats();

  /**
   * 导出CSV
   * TODO: 实现CSV导出功能（P3-14）
   */
  const handleExport = () => {
    console.log('导出CSV功能开发中...');
  };

  /**
   * 刷新数据
   */
  const handleRefresh = () => {
    loadTrades();
  };

  /**
   * 清空筛选
   */
  const handleClearFilters = () => {
    setFilters({
      keyword: '',
      side: undefined,
      action: undefined,
      dateRange: undefined,
    });
  };

  // 如果没有结果数据，显示提示
  if (!task.resultSummary) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="交易数据不可用"
          description="回测任务尚未完成或交易数据生成失败"
          type="warning"
          showIcon
        />
      </div>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 数据说明提示 */}
      <Alert
        message="交易数据说明"
        description="当前显示的是基于回测结果生成的模拟交易数据。完整的交易明细数据将在后续版本中从后端API和DuckDB/Parquet文件获取。"
        type="info"
        showIcon
        closable
      />

      {/* 统计卡片 */}
      <Card>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="总盈亏"
              value={stats.totalPnL}
              precision={2}
              prefix="$"
              valueStyle={{
                color: stats.totalPnL >= 0 ? '#3f8600' : '#cf1322',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="盈利交易"
              value={stats.profitTrades}
              suffix="笔"
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="亏损交易"
              value={stats.lossTrades}
              suffix="笔"
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总手续费"
              value={stats.totalCommission}
              precision={2}
              prefix="$"
            />
          </Col>
        </Row>
      </Card>

      {/* 筛选工具栏 */}
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16}>
            <Col span={6}>
              <Input
                placeholder="搜索交易对或交易ID"
                prefix={<FilterOutlined />}
                value={filters.keyword}
                onChange={(e) =>
                  setFilters({ ...filters, keyword: e.target.value })
                }
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
                  { label: '做多', value: 'long' },
                  { label: '做空', value: 'short' },
                ]}
              />
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="操作类型"
                value={filters.action}
                onChange={(value) => setFilters({ ...filters, action: value })}
                allowClear
                options={[
                  { label: '开仓', value: 'open' },
                  { label: '平仓', value: 'close' },
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
                <Button
                  icon={<SwapOutlined />}
                  type="primary"
                  onClick={loadTrades}
                >
                  应用筛选
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={16} justify="space-between">
            <Col>
              <Text type="secondary">
                因子筛选功能将在下一版本中提供（P3-12）
              </Text>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleRefresh}
                  loading={loading}
                >
                  刷新
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  type="primary"
                  onClick={handleExport}
                >
                  导出CSV
                </Button>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 交易表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={trades}
          rowKey="tradeId"
          loading={loading}
          pagination={pagination}
          onChange={(newPagination) => setPagination(newPagination)}
          scroll={{ x: 1500, y: 600 }}
          size="small"
        />
      </Card>
    </Space>
  );
};

export default TaskTradesTab;

