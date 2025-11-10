/**
 * 代码差异计算服务
 * 
 * 使用diff算法计算两个版本代码的差异
 * 
 * @module strategies/services/code-diff
 */

import { Injectable } from '@nestjs/common';
import * as Diff from 'diff';
import {
  CodeDiffResult,
  CodeBlockDiff,
  CodeLineDiff,
  DiffType,
} from '../dto/version-compare.dto';

/**
 * 代码差异计算服务
 */
@Injectable()
export class CodeDiffService {
  /**
   * 计算两个代码版本的差异
   * 
   * @param sourceCode 源代码
   * @param targetCode 目标代码
   * @returns 代码差异结果
   */
  calculateDiff(sourceCode: string, targetCode: string): CodeDiffResult {
    // 使用diff库计算差异
    const changes = Diff.diffLines(sourceCode, targetCode);
    
    // 转换为我们的数据结构
    const diffBlocks: CodeBlockDiff[] = [];
    const stats = {
      addedLines: 0,
      removedLines: 0,
      modifiedLines: 0,
      unchangedLines: 0,
    };

    let currentLineNumber = 1;
    let sourceLineNumber = 1;
    let targetLineNumber = 1;

    for (const change of changes) {
      const lines = change.value.split('\n').filter(line => line !== '');
      const lineCount = lines.length;

      if (change.added) {
        // 新增的行
        const blockLines: CodeLineDiff[] = lines.map((content, index) => ({
          lineNumber: targetLineNumber + index,
          type: DiffType.ADDED,
          content,
          newLineNumber: targetLineNumber + index,
        }));

        diffBlocks.push({
          startLine: targetLineNumber,
          endLine: targetLineNumber + lineCount - 1,
          type: DiffType.ADDED,
          lines: blockLines,
        });

        stats.addedLines += lineCount;
        targetLineNumber += lineCount;
      } else if (change.removed) {
        // 删除的行
        const blockLines: CodeLineDiff[] = lines.map((content, index) => ({
          lineNumber: sourceLineNumber + index,
          type: DiffType.REMOVED,
          content,
          oldLineNumber: sourceLineNumber + index,
        }));

        diffBlocks.push({
          startLine: sourceLineNumber,
          endLine: sourceLineNumber + lineCount - 1,
          type: DiffType.REMOVED,
          lines: blockLines,
        });

        stats.removedLines += lineCount;
        sourceLineNumber += lineCount;
      } else {
        // 未变化的行
        stats.unchangedLines += lineCount;
        sourceLineNumber += lineCount;
        targetLineNumber += lineCount;
        currentLineNumber += lineCount;
      }
    }

    return {
      sourceCode,
      targetCode,
      diffBlocks,
      stats,
    };
  }

  /**
   * 计算代码相似度
   * 
   * @param sourceCode 源代码
   * @param targetCode 目标代码
   * @returns 相似度百分比 (0-100)
   */
  calculateSimilarity(sourceCode: string, targetCode: string): number {
    const result = this.calculateDiff(sourceCode, targetCode);
    const totalLines = 
      result.stats.addedLines +
      result.stats.removedLines +
      result.stats.unchangedLines;

    if (totalLines === 0) {
      return 100;
    }

    return Math.round((result.stats.unchangedLines / totalLines) * 100);
  }

  /**
   * 获取差异摘要
   * 
   * @param result 差异结果
   * @returns 差异摘要文本
   */
  getDiffSummary(result: CodeDiffResult): string {
    const { stats } = result;
    const parts: string[] = [];

    if (stats.addedLines > 0) {
      parts.push(`+${stats.addedLines} lines added`);
    }
    if (stats.removedLines > 0) {
      parts.push(`-${stats.removedLines} lines removed`);
    }
    if (stats.modifiedLines > 0) {
      parts.push(`~${stats.modifiedLines} lines modified`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No changes';
  }

  /**
   * 检查是否有差异
   * 
   * @param result 差异结果
   * @returns 是否有差异
   */
  hasDifferences(result: CodeDiffResult): boolean {
    return (
      result.stats.addedLines > 0 ||
      result.stats.removedLines > 0 ||
      result.stats.modifiedLines > 0
    );
  }
}

