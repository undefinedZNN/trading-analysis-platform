import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Space,
  Select,
  Input,
  List,
  Tag,
  Typography,
  Spin,
  Alert,
  Button,
  Empty,
  message,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  BugOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchTaskLogs,
  fetchTaskLogStats,
  type TaskLog,
  type TaskLogStats,
  LogLevel,
} from '../../../shared/api/backtestTasks';

const { Text } = Typography;
const { Search } = Input;

interface TaskLogsTabProps {
  taskId: string;
}

/**
 * 任务日志Tab组件
 * 显示任务执行日志，支持筛选、搜索、下拉加载更多
 */
export const TaskLogsTab: React.FC<TaskLogsTabProps> = ({ taskId }) => {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [stats, setStats] = useState<TaskLogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | undefined>();
  const [keyword, setKeyword] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const listContainerRef = useRef<HTMLDivElement>(null);

  /**
   * 加载日志列表
   */
  const loadLogs = async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }

      // 获取最早的日志时间作为before参数（用于分页）
      const before = loadMore && logs.length > 0 
        ? logs[logs.length - 1].loggedAt 
        : undefined;

      const response = await fetchTaskLogs(taskId, {
        level: selectedLevel,
        keyword: keyword || undefined,
        before,
        limit: 50, // 每次加载50条
      });

      if (loadMore) {
        // 下拉加载更多：追加到末尾
        setLogs(prev => [...prev, ...response.logs]);
      } else {
        // 初始加载或刷新：替换
        setLogs(response.logs);
      }

      setHasMore(response.hasMore);

      // 如果是初始加载，也加载统计信息
      if (!loadMore) {
        const statsData = await fetchTaskLogStats(taskId);
        setStats(statsData);
      }
    } catch (err: any) {
      console.error('加载日志失败:', err);
      message.error('加载日志失败: ' + err.message);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  /**
   * 初始加载
   */
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  /**
   * 筛选条件变化时重新加载
   */
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel, keyword]);

  /**
   * 监听滚动事件，实现"下拉加载更多"
   * 当用户滚动到顶部时，自动加载更早的日志
   */
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 检查是否滚动到顶部（或接近顶部）
      if (container.scrollTop < 50 && hasMore && !isLoadingMore) {
        console.log('[日志] 触发下拉加载');
        const currentScrollHeight = container.scrollHeight;
        
        loadLogs(true).then(() => {
          // 加载完成后，恢复滚动位置
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            const heightDiff = newScrollHeight - currentScrollHeight;
            container.scrollTop = heightDiff + container.scrollTop;
          });
        });
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoadingMore, logs.length]);

  /**
   * 获取日志级别图标和颜色
   */
  const getLevelConfig = (level: LogLevel) => {
    const configs = {
      [LogLevel.DEBUG]: {
        icon: <BugOutlined />,
        color: 'default',
        text: 'DEBUG',
      },
      [LogLevel.INFO]: {
        icon: <InfoCircleOutlined />,
        color: 'blue',
        text: 'INFO',
      },
      [LogLevel.WARN]: {
        icon: <WarningOutlined />,
        color: 'warning',
        text: 'WARN',
      },
      [LogLevel.ERROR]: {
        icon: <CloseCircleOutlined />,
        color: 'error',
        text: 'ERROR',
      },
    };

    return configs[level] || configs[LogLevel.INFO];
  };

  /**
   * 手动刷新
   */
  const handleRefresh = () => {
    loadLogs();
  };

  /**
   * 清空筛选
   */
  const handleClearFilters = () => {
    setSelectedLevel(undefined);
    setKeyword('');
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* 统计卡片 */}
      {stats && (
        <Card size="small">
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="总日志数"
                value={stats.total}
                suffix="条"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="错误日志"
                value={stats.error}
                suffix="条"
                valueStyle={{ color: stats.error > 0 ? '#cf1322' : undefined }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="警告日志"
                value={stats.warn}
                suffix="条"
                valueStyle={{ color: stats.warn > 0 ? '#faad14' : undefined }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="信息日志"
                value={stats.info}
                suffix="条"
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 筛选工具栏 */}
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <FilterOutlined />
            <Select
              style={{ width: 120 }}
              placeholder="日志级别"
              value={selectedLevel}
              onChange={setSelectedLevel}
              allowClear
              options={[
                { label: 'DEBUG', value: LogLevel.DEBUG },
                { label: 'INFO', value: LogLevel.INFO },
                { label: 'WARN', value: LogLevel.WARN },
                { label: 'ERROR', value: LogLevel.ERROR },
              ]}
            />

            <Search
              placeholder="搜索日志内容"
              style={{ width: 250 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
            />

            {(selectedLevel || keyword) && (
              <Button size="small" onClick={handleClearFilters}>
                清空筛选
              </Button>
            )}
          </Space>

          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </Card>

      {/* 日志列表 */}
      <Card
        title={
          <Space>
            <span>执行日志</span>
            {hasMore && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                向上滚动加载更早的日志
              </Text>
            )}
          </Space>
        }
      >
        {/* 加载更多提示（顶部） */}
        {isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              加载更早的日志...
            </Text>
          </div>
        )}

        {/* 没有更多日志提示 */}
        {!hasMore && logs.length > 0 && (
          <Alert
            message="已加载全部日志"
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        {/* 日志列表容器 */}
        <div
          ref={listContainerRef}
          style={{
            maxHeight: 600,
            overflow: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 4,
            background: '#fafafa',
          }}
        >
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">加载日志中...</Text>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <Empty
              description={
                selectedLevel || keyword
                  ? '没有符合筛选条件的日志'
                  : '暂无日志'
              }
              style={{ padding: '48px 0' }}
            />
          ) : (
            <List
              dataSource={logs}
              renderItem={(log) => {
                const levelConfig = getLevelConfig(log.level);
                return (
                  <List.Item
                    key={log.logId}
                    style={{
                      padding: '8px 16px',
                      borderBottom: '1px solid #f0f0f0',
                      background: '#fff',
                    }}
                  >
                    <Space
                      direction="vertical"
                      style={{ width: '100%' }}
                      size={4}
                    >
                      {/* 日志头部：级别 + 模块 + 时间 */}
                      <Space>
                        <Tag
                          icon={levelConfig.icon}
                          color={levelConfig.color}
                        >
                          {levelConfig.text}
                        </Tag>
                        {log.module && (
                          <Tag color="cyan">{log.module}</Tag>
                        )}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(log.loggedAt).format('YYYY-MM-DD HH:mm:ss.SSS')}
                        </Text>
                      </Space>

                      {/* 日志消息 */}
                      <Text
                        style={{
                          fontFamily: 'Monaco, Consolas, monospace',
                          fontSize: 13,
                          wordBreak: 'break-word',
                        }}
                      >
                        {log.message}
                      </Text>

                      {/* 元数据（如果有） */}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <pre
                          style={{
                            margin: 0,
                            padding: 8,
                            background: '#f5f5f5',
                            borderRadius: 4,
                            fontSize: 11,
                            fontFamily: 'Monaco, Consolas, monospace',
                            maxHeight: 100,
                            overflow: 'auto',
                          }}
                        >
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </Card>
    </Space>
  );
};

export default TaskLogsTab;

