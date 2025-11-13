import React from 'react';
import { Card, Space, Alert, Collapse, Typography } from 'antd';
import { CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { type BacktestTask } from '../../../shared/api/backtestTasks';

const { Panel } = Collapse;
const { Text } = Typography;

interface TaskErrorCardProps {
  task: BacktestTask;
}

/**
 * 任务错误信息卡片组件
 * 用于显示失败或取消任务的错误信息和堆栈
 */
export const TaskErrorCard: React.FC<TaskErrorCardProps> = ({ task }) => {
  // 如果没有错误信息，不渲染
  if (!task.errorMessage) {
    return null;
  }

  /**
   * 格式化错误堆栈，使其更易读
   */
  const formatErrorStack = (stack: string) => {
    // 将堆栈按行分割，添加缩进
    const lines = stack.split('\n');
    return lines
      .map((line, index) => {
        if (index === 0) return line; // 第一行通常是错误消息
        return `  ${line.trim()}`; // 其他行添加缩进
      })
      .join('\n');
  };

  /**
   * 提取错误类型（如果有）
   */
  const getErrorType = () => {
    // 尝试从错误消息中提取错误类型
    const match = task.errorMessage?.match(/^(\w+Error|Error):/);
    if (match) {
      return match[1];
    }
    return '执行错误';
  };

  /**
   * 判断是否是用户取消
   */
  const isCancelled = task.status === 'cancelled';

  return (
    <Card
      title={
        <Space>
          {isCancelled ? (
            <>
              <WarningOutlined style={{ color: '#faad14' }} />
              <span>任务已取消</span>
            </>
          ) : (
            <>
              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
              <span>错误信息</span>
            </>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 错误提示 */}
        <Alert
          message={isCancelled ? '任务已被用户取消' : getErrorType()}
          description={task.errorMessage}
          type={isCancelled ? 'warning' : 'error'}
          showIcon
        />

        {/* 错误堆栈（可折叠） */}
        {task.errorStack && !isCancelled && (
          <Collapse
            ghost
            items={[
              {
                key: '1',
                label: (
                  <Space>
                    <WarningOutlined style={{ color: '#faad14' }} />
                    <Text strong>查看详细错误堆栈</Text>
                  </Space>
                ),
                children: (
                  <div>
                    <pre
                      style={{
                        background: '#f5f5f5',
                        padding: 16,
                        borderRadius: 4,
                        fontSize: 12,
                        lineHeight: 1.6,
                        maxHeight: 400,
                        overflow: 'auto',
                        fontFamily: 'Monaco, Consolas, monospace',
                        margin: 0,
                      }}
                    >
                      {formatErrorStack(task.errorStack)}
                    </pre>

                    {/* 复制按钮提示 */}
                    <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
                      <Text type="secondary">
                        提示：选中文本后可复制错误堆栈用于调试
                      </Text>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        )}

        {/* 操作建议 */}
        {!isCancelled && (
          <Alert
            message="处理建议"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>检查策略脚本是否存在语法错误或运行时异常</li>
                <li>确认数据集是否完整且格式正确</li>
                <li>验证策略参数配置是否合理</li>
                <li>如需帮助，请将错误堆栈提供给技术支持</li>
                <li>修复问题后，可以点击"重试"按钮重新执行</li>
              </ul>
            }
            type="info"
            showIcon
            style={{ marginTop: 8 }}
          />
        )}
      </Space>
    </Card>
  );
};

export default TaskErrorCard;

