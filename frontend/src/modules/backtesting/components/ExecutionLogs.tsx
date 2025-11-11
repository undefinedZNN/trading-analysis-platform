/**
 * 执行日志组件
 */

import React, { useEffect, useRef } from 'react';
import { Card, List, Tag, Space, Select, Button, Empty } from 'antd';
import { DownloadOutlined, ClearOutlined } from '@ant-design/icons';
import type { ExecutionLog } from '../services/executionApi';
import './ExecutionLogs.less';

interface ExecutionLogsProps {
  logs: ExecutionLog[];
  onClear?: () => void;
}

const LOG_LEVEL_COLORS = {
  debug: 'default',
  info: 'blue',
  warn: 'orange',
  error: 'red',
} as const;

export const ExecutionLogsComponent: React.FC<ExecutionLogsProps> = ({ logs, onClear }) => {
  const [filterLevel, setFilterLevel] = React.useState<string>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  // 过滤日志
  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  // 导出日志
  const handleExport = () => {
    const content = filteredLogs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleString();
        const data = log.data ? `\n${JSON.stringify(log.data, null, 2)}` : '';
        return `[${time}] [${log.level.toUpperCase()}] ${log.message}${data}`;
      })
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card
      title="执行日志"
      className="execution-logs"
      extra={
        <Space>
          <Select
            value={filterLevel}
            onChange={setFilterLevel}
            style={{ width: 120 }}
            size="small"
          >
            <Select.Option value="all">全部</Select.Option>
            <Select.Option value="debug">调试</Select.Option>
            <Select.Option value="info">信息</Select.Option>
            <Select.Option value="warn">警告</Select.Option>
            <Select.Option value="error">错误</Select.Option>
          </Select>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
            导出
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={onClear}>
            清空
          </Button>
        </Space>
      }
    >
      <div
        ref={listRef}
        className="logs-container"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const isAtBottom =
            Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 10;
          autoScroll.current = isAtBottom;
        }}
      >
        {filteredLogs.length === 0 ? (
          <Empty description="暂无日志" />
        ) : (
          <List
            dataSource={filteredLogs}
            renderItem={(log) => (
              <List.Item className={`log-item log-${log.level}`}>
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space>
                    <span className="log-time">{formatTime(log.timestamp)}</span>
                    <Tag color={LOG_LEVEL_COLORS[log.level]}>{log.level.toUpperCase()}</Tag>
                    <span className="log-message">{log.message}</span>
                  </Space>
                  {log.data && (
                    <pre className="log-data">{JSON.stringify(log.data, null, 2)}</pre>
                  )}
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  );
};

