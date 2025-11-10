/**
 * Monaco代码差异查看器组件
 * 
 * 使用Monaco Editor的内置diff功能
 * 提供更好的性能和用户体验
 */

import React, { useRef, useEffect } from 'react';
import { Card, Statistic, Row, Col, Empty } from 'antd';
import * as monaco from 'monaco-editor';
import './MonacoCodeDiffViewer.less';

export interface MonacoCodeDiffViewerProps {
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
  /** 是否只读 */
  readOnly?: boolean;
  /** 是否显示统计信息 */
  showStats?: boolean;
  /** 高度 */
  height?: number | string;
  /** 样式类名 */
  className?: string;
  /** 主题 */
  theme?: 'vs' | 'vs-dark' | 'hc-black';
}

/**
 * Monaco代码差异查看器
 */
export const MonacoCodeDiffViewer: React.FC<MonacoCodeDiffViewerProps> = ({
  oldCode,
  newCode,
  oldVersion = 'Source',
  language = 'typescript',
  readOnly = true,
  showStats = true,
  height = 600,
  className,
  theme = 'vs',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  // 计算统计信息
  const stats = React.useMemo(() => {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');

    let additions = 0;
    let deletions = 0;

    // 简单的行级别diff统计
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (!oldLine) {
          additions++;
        } else if (!newLine) {
          deletions++;
        } else {
          additions++;
          deletions++;
        }
      }
    }

    return {
      additions,
      deletions,
      changes: additions + deletions,
      oldLines: oldLines.length,
      newLines: newLines.length,
    };
  }, [oldCode, newCode]);

  // 初始化Monaco Diff Editor
  useEffect(() => {
    if (!containerRef.current) return;

    // 创建diff editor
    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly,
      automaticLayout: true,
      renderSideBySide: true,
      theme,
      fontSize: 13,
      lineNumbers: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderWhitespace: 'selection',
      diffWordWrap: 'off',
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      originalEditable: false,
    });

    // 设置模型
    const originalModel = monaco.editor.createModel(oldCode, language);
    const modifiedModel = monaco.editor.createModel(newCode, language);

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = diffEditor;

    // 清理
    return () => {
      originalModel.dispose();
      modifiedModel.dispose();
      diffEditor.dispose();
    };
  }, [oldCode, newCode, language, readOnly, theme]);

  // 更新代码
  useEffect(() => {
    if (!editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    if (model.original.getValue() !== oldCode) {
      model.original.setValue(oldCode);
    }

    if (model.modified.getValue() !== newCode) {
      model.modified.setValue(newCode);
    }
  }, [oldCode, newCode]);

  // 如果没有差异
  const hasDifferences = oldCode !== newCode;

  if (!hasDifferences) {
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
    <div className={`monaco-code-diff-viewer ${className || ''}`}>
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
                title={`${oldVersion} 行数`}
                value={stats.oldLines}
                valueStyle={{ color: '#8c8c8c' }}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* Diff Editor容器 */}
      <Card className="diff-editor-card">
        <div
          ref={containerRef}
          style={{
            height: typeof height === 'number' ? `${height}px` : height,
            width: '100%',
          }}
        />
      </Card>
    </div>
  );
};

export default MonacoCodeDiffViewer;

