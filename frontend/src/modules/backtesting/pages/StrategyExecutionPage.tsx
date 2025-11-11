/**
 * 策略执行页面
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Card, Badge, Alert, Space, Typography, Spin } from 'antd';
import { ExecutionControl } from '../components/ExecutionControl';
import { ExecutionMetricsComponent } from '../components/ExecutionMetrics';
import { ExecutionLogsComponent } from '../components/ExecutionLogs';
import { ExecutionApi } from '../services/executionApi';
import type { ExecutionStatus } from '../services/executionApi';
import { executionWebSocket } from '../services/executionWebSocket';
import { fetchStrategy } from '../../../shared/api/backtesting';
import type { ExecutionMetrics, ExecutionLog, ResourceStats, AnomalyEvent } from '../services/executionApi';
import type { StrategyDetail } from '../../../shared/api/backtesting';
import './StrategyExecutionPage.less';

const { Title, Text } = Typography;

const STATUS_COLORS = {
  idle: 'default',
  loading: 'processing',
  running: 'processing',
  paused: 'warning',
  stopped: 'default',
  error: 'error',
  completed: 'success',
} as const;

const STATUS_TEXT = {
  idle: '空闲',
  loading: '加载中',
  running: '运行中',
  paused: '已暂停',
  stopped: '已停止',
  error: '错误',
  completed: '已完成',
} as const;

export const StrategyExecutionPage: React.FC = () => {
  const { strategyId, versionId } = useParams<{ strategyId: string; versionId: string }>();

  const [sessionId, setSessionId] = useState<string>();
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [currentTime, setCurrentTime] = useState<string>();
  const [metrics, setMetrics] = useState<ExecutionMetrics>();
  const [metricsHistory, setMetricsHistory] = useState<ExecutionMetrics[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [resourceStats, setResourceStats] = useState<ResourceStats>();
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);

  // 加载策略信息
  useEffect(() => {
    const loadStrategy = async () => {
      if (!strategyId) return;
      
      try {
        setStrategyLoading(true);
        const data = await fetchStrategy(strategyId);
        setStrategy(data);
      } catch (error) {
        console.error('加载策略失败:', error);
      } finally {
        setStrategyLoading(false);
      }
    };

    loadStrategy();
  }, [strategyId]);

  // 初始化WebSocket
  useEffect(() => {
    executionWebSocket.connect({
      onConnect: () => {
        console.log('WebSocket连接成功');
        // 订阅资源统计
        executionWebSocket.subscribeResource();
      },
      onDisconnect: () => {
        console.log('WebSocket断开连接');
      },
      onStatusUpdate: (data) => {
        setStatus(data.status as ExecutionStatus);
        if (data.currentTime) {
          setCurrentTime(data.currentTime);
        }
      },
      onMetricsUpdate: (data) => {
        setMetrics(data.metrics);
        setMetricsHistory((prev) => [...prev.slice(-99), data.metrics]);
      },
      onLog: (data) => {
        setLogs((prev) => [...prev, data.log]);
      },
      onResourceUpdate: (stats) => {
        setResourceStats(stats);
      },
      onAnomaly: (anomaly) => {
        setAnomalies((prev) => [...prev.slice(-9), anomaly]);
      },
      onError: (data) => {
        console.error('执行错误:', data.error);
      },
    });

    return () => {
      if (sessionId) {
        executionWebSocket.unsubscribeSession(sessionId);
      }
      executionWebSocket.unsubscribeResource();
      executionWebSocket.disconnect();
    };
  }, []);

  // 订阅会话
  useEffect(() => {
    if (sessionId) {
      executionWebSocket.subscribeSession(sessionId);
      
      // 定期获取指标
      const interval = setInterval(async () => {
        try {
          const m = await ExecutionApi.getMetrics(sessionId);
          setMetrics(m);
        } catch (error) {
          console.error('获取指标失败:', error);
        }
      }, 2000);

      return () => {
        clearInterval(interval);
        executionWebSocket.unsubscribeSession(sessionId);
      };
    }
  }, [sessionId]);

  // 启动执行
  const handleStart = (newSessionId: string) => {
    setSessionId(newSessionId);
    setStatus('running');
    setLogs([]);
    setMetricsHistory([]);
    setAnomalies([]);
  };

  // 停止执行
  const handleStop = () => {
    setStatus('stopped');
  };

  // 暂停执行
  const handlePause = () => {
    setStatus('paused');
  };

  // 恢复执行
  const handleResume = () => {
    setStatus('running');
  };

  // 清空日志
  const handleClearLogs = () => {
    setLogs([]);
  };

  if (!strategyId || !versionId) {
    return <Alert message="缺少策略ID或版本ID" type="error" />;
  }

  // 获取当前版本的parameterSchema
  const currentVersion = strategy?.scriptVersions?.find(v => v.scriptVersionId === versionId);
  const parameterSchema = currentVersion?.parameterSchema as any[] || [];

  return (
    <div className="strategy-execution-page">
      <Spin spinning={strategyLoading}>
        <div className="page-header">
          <Space direction="vertical" size={4}>
            <Title level={3}>策略执行 - {strategy?.name || '加载中...'}</Title>
            <Space>
              <Text type="secondary">策略ID: {strategyId}</Text>
              <Text type="secondary">版本ID: {versionId}</Text>
              {sessionId && <Text type="secondary">会话ID: {sessionId}</Text>}
            </Space>
          </Space>
          <div className="status-badge">
            <Badge status={STATUS_COLORS[status]} text={STATUS_TEXT[status]} />
            {currentTime && (
              <Text type="secondary" style={{ marginLeft: 16 }}>
                当前时间: {new Date(currentTime).toLocaleString()}
              </Text>
            )}
          </div>
        </div>

      {/* 异常告警 */}
      {anomalies.length > 0 && (
        <Alert
          message="异常告警"
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              {anomalies.map((anomaly, index) => (
                <div key={index}>
                  <Badge status={anomaly.severity === 'critical' ? 'error' : 'warning'} />
                  <Text>{anomaly.message}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({new Date(anomaly.timestamp).toLocaleTimeString()})
                  </Text>
                </div>
              ))}
            </Space>
          }
          type={anomalies.some((a) => a.severity === 'critical') ? 'error' : 'warning'}
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {/* 左侧: 执行控制 */}
        <Col span={8}>
          <ExecutionControl
            strategyId={strategyId}
            versionId={versionId}
            status={status}
            sessionId={sessionId}
            parameterSchema={parameterSchema}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
          />
        </Col>

        {/* 右侧: 指标展示 */}
        <Col span={16}>
          <ExecutionMetricsComponent
            metrics={metrics}
            metricsHistory={metricsHistory}
            resourceStats={resourceStats}
          />
        </Col>

        {/* 底部: 日志 */}
        <Col span={24}>
          <ExecutionLogsComponent logs={logs} onClear={handleClearLogs} />
        </Col>
      </Row>
      </Spin>
    </div>
  );
};

