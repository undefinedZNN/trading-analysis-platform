/**
 * 代码差异查看器组件
 * 
 * 使用react-diff-view展示代码差异
 * 支持语法高亮、行号、差异导航
 */

import React, { useMemo, useState } from 'react';
import { parseDiff, Diff, Hunk, tokenize } from 'react-diff-view';
import { diffLines, formatLines } from 'unidiff';
import { refractor } from 'refractor';
import typescript from 'refractor/lang/typescript';
import { Card, Space, Button, Statistic, Row, Col, Radio, Empty } from 'antd';
import {
  UpOutlined,
  DownOutlined,
  ExpandOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import 'react-diff-view/style/index.css';
import './CodeDiffViewer.less';

// 注册TypeScript语法
refractor.register(typescript);

export interface CodeDiffViewerProps {
  /** 源代码 */
  oldCode: string;
  /** 目标代码 */
  newCode: string;
  /** 源版本名称 */
  oldVersion?: string;
  /** 目标版本名称 */
  newVersion?: string;
  /** 语言 */
  language?: string;
  /** 是否显示统计信息 */
  showStats?: boolean;
  /** 是否显示导航 */
  showNavigation?: boolean;
  /** 样式类名 */
  className?: string;
}

type ViewType = 'split' | 'unified';

/**
 * 代码差异查看器
 */
export const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({
  oldCode,
  newCode,
  language = 'typescript',
  showStats = true,
  showNavigation = true,
  className,
}) => {
  const [viewType, setViewType] = useState<ViewType>('split');
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);

  // 生成diff
  const diffText = useMemo(() => {
    if (!oldCode && !newCode) return '';
    
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    
    return formatLines(diffLines(oldLines, newLines), {
      context: 3,
    });
  }, [oldCode, newCode]);

  // 解析diff
  const [diff] = useMemo(() => {
    if (!diffText) return [null];
    
    try {
      const files = parseDiff(diffText, { nearbySequences: 'zip' });
      return files;
    } catch (error) {
      console.error('Failed to parse diff:', error);
      return [null];
    }
  }, [diffText]);

  // 语法高亮tokens
  const tokens = useMemo(() => {
    if (!diff) return undefined;

    try {
      const options = {
        refractor,
        highlight: true,
        language,
      };

      return tokenize(diff.hunks, options);
    } catch (error) {
      console.error('Failed to tokenize:', error);
      return undefined;
    }
  }, [diff, language]);

  // 计算统计信息
  const stats = useMemo(() => {
    if (!diff) {
      return { additions: 0, deletions: 0, changes: 0 };
    }

    let additions = 0;
    let deletions = 0;

    diff.hunks.forEach((hunk) => {
      hunk.changes.forEach((change) => {
        if (change.type === 'insert') {
          additions++;
        } else if (change.type === 'delete') {
          deletions++;
        }
      });
    });

    return {
      additions,
      deletions,
      changes: additions + deletions,
    };
  }, [diff]);

  // 导航到上一个差异块
  const handlePreviousHunk = () => {
    if (!diff) return;
    setCurrentHunkIndex((prev) => Math.max(0, prev - 1));
  };

  // 导航到下一个差异块
  const handleNextHunk = () => {
    if (!diff) return;
    setCurrentHunkIndex((prev) => Math.min(diff.hunks.length - 1, prev + 1));
  };

  // 滚动到当前差异块
  React.useEffect(() => {
    if (!diff || diff.hunks.length === 0) return;

    const hunkElement = document.querySelector(
      `[data-hunk-index="${currentHunkIndex}"]`
    );
    if (hunkElement) {
      hunkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentHunkIndex, diff]);

  // 如果没有差异
  if (!diff || diff.hunks.length === 0) {
    return (
      <Card className={className}>
        <Empty
          description="没有代码差异"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <div className={`code-diff-viewer ${className || ''}`}>
      {/* 统计信息 */}
      {showStats && (
        <Card className="diff-stats-card" size="small">
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="新增行"
                value={stats.additions}
                valueStyle={{ color: '#52c41a' }}
                prefix="+"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="删除行"
                value={stats.deletions}
                valueStyle={{ color: '#ff4d4f' }}
                prefix="-"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="总变更"
                value={stats.changes}
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="差异块"
                value={diff.hunks.length}
                valueStyle={{ color: '#722ed1' }}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 工具栏 */}
      <Card className="diff-toolbar-card" size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Radio.Group
              value={viewType}
              onChange={(e) => setViewType(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="split">
                <ExpandOutlined /> 分屏
              </Radio.Button>
              <Radio.Button value="unified">
                <CompressOutlined /> 统一
              </Radio.Button>
            </Radio.Group>
          </Space>

          {showNavigation && diff.hunks.length > 1 && (
            <Space>
              <span style={{ color: '#8c8c8c', fontSize: '12px' }}>
                差异块 {currentHunkIndex + 1} / {diff.hunks.length}
              </span>
              <Button
                size="small"
                icon={<UpOutlined />}
                onClick={handlePreviousHunk}
                disabled={currentHunkIndex === 0}
              >
                上一个
              </Button>
              <Button
                size="small"
                icon={<DownOutlined />}
                onClick={handleNextHunk}
                disabled={currentHunkIndex === diff.hunks.length - 1}
              >
                下一个
              </Button>
            </Space>
          )}
        </Space>
      </Card>

      {/* Diff视图 */}
      <Card className="diff-content-card">
        <Diff
          viewType={viewType}
          diffType={diff.type}
          hunks={diff.hunks}
          tokens={tokens}
          renderGutter={(options) => {
            const { change, renderDefault } = options;
            
            // 高亮当前差异块
            const hunkIndex = diff.hunks.findIndex((hunk) =>
              hunk.changes.includes(change)
            );
            const isCurrentHunk = hunkIndex === currentHunkIndex;

            return (
              <td
                className={`diff-gutter ${isCurrentHunk ? 'current-hunk' : ''}`}
                data-hunk-index={hunkIndex}
              >
                {renderDefault()}
              </td>
            );
          }}
        >
          {(hunks) =>
            hunks.map((hunk, index) => (
              <Hunk
                key={`hunk-${index}`}
                hunk={hunk}
                data-hunk-index={index}
              />
            ))
          }
        </Diff>
      </Card>
    </div>
  );
};

export default CodeDiffViewer;

