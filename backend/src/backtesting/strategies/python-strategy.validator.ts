import { Injectable, Logger } from '@nestjs/common';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Python Backtrader 策略脚本验证器
 * 
 * 验证 Backtrader 策略脚本的基本结构和语法
 */
@Injectable()
export class PythonStrategyValidator {
  private readonly logger = new Logger(PythonStrategyValidator.name);

  /**
   * 验证 Python Backtrader 策略脚本
   */
  async validate(code: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本检查：代码不能为空
    if (!code || code.trim().length === 0) {
      errors.push('策略代码不能为空');
      return { isValid: false, errors, warnings };
    }

    // 检查必需的导入
    if (!this.checkImport(code, 'backtrader') && !this.checkImport(code, 'bt')) {
      errors.push('缺少必需的导入: import backtrader as bt');
    }

    // 检查策略类定义
    if (!this.checkStrategyClass(code)) {
      errors.push('未找到策略类定义。策略类必须继承自 bt.Strategy');
    }

    // 检查策略导出
    if (!this.checkStrategyExport(code)) {
      errors.push('未找到策略导出。必须包含 Strategy = MyStrategy 或 strategy = MyStrategy');
    }

    // 检查必需的方法
    const hasNext = this.checkMethod(code, 'next');
    if (!hasNext) {
      warnings.push('策略类缺少 next() 方法。这是策略的核心逻辑方法');
    }

    // 检查推荐的方法
    if (!this.checkMethod(code, '__init__')) {
      warnings.push('建议添加 __init__() 方法来初始化指标和变量');
    }

    // 检查常见的语法错误
    this.checkCommonSyntaxErrors(code, errors);

    // 检查最佳实践
    this.checkBestPractices(code, warnings);

    const isValid = errors.length === 0;

    this.logger.debug(
      `Validation result: isValid=${isValid}, errors=${errors.length}, warnings=${warnings.length}`,
    );

    return { isValid, errors, warnings };
  }

  /**
   * 检查导入语句
   */
  private checkImport(code: string, moduleName: string): boolean {
    const importPatterns = [
      new RegExp(`import\\s+${moduleName}`, 'i'),
      new RegExp(`from\\s+${moduleName}\\s+import`, 'i'),
    ];
    return importPatterns.some(pattern => pattern.test(code));
  }

  /**
   * 检查策略类定义
   */
  private checkStrategyClass(code: string): boolean {
    // 匹配 class XXX(bt.Strategy): 或 class XXX(backtrader.Strategy):
    const classPattern = /class\s+(\w+)\s*\(\s*(bt\.Strategy|backtrader\.Strategy)\s*\)\s*:/;
    return classPattern.test(code);
  }

  /**
   * 检查策略导出
   */
  private checkStrategyExport(code: string): boolean {
    // 匹配 Strategy = XXX 或 strategy = XXX
    const exportPattern = /^(Strategy|strategy)\s*=\s*\w+\s*$/m;
    return exportPattern.test(code);
  }

  /**
   * 检查方法定义
   */
  private checkMethod(code: string, methodName: string): boolean {
    const methodPattern = new RegExp(`def\\s+${methodName}\\s*\\(`, 'i');
    return methodPattern.test(code);
  }

  /**
   * 检查常见的语法错误
   */
  private checkCommonSyntaxErrors(code: string, errors: string[]): void {
    // 检查缩进问题（Python 的常见错误）
    const lines = code.split('\n');
    let inClassBlock = false;
    let classIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 检查 class 定义
      if (/class\s+\w+/.test(line)) {
        inClassBlock = true;
        classIndent = line.search(/\S/);
        continue;
      }

      // 在类定义块中
      if (inClassBlock) {
        const currentIndent = line.search(/\S/);

        // 如果是空行或注释，跳过
        if (line.trim().length === 0 || line.trim().startsWith('#')) {
          continue;
        }

        // 检查方法定义的缩进
        if (/def\s+\w+/.test(line)) {
          if (currentIndent <= classIndent) {
            errors.push(`第 ${lineNum} 行: 方法定义缩进错误`);
          }
        }
      }

      // 检查未闭合的括号（简单检查）
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (openParens !== closeParens && !line.trim().endsWith('\\')) {
        // 可能是多行语句，不报错，只记录警告
      }
    }

    // 检查是否有制表符（Python 推荐使用空格）
    if (code.includes('\t')) {
      errors.push('代码中包含制表符。Python 推荐使用空格进行缩进');
    }
  }

  /**
   * 检查最佳实践
   */
  private checkBestPractices(code: string, warnings: string[]): void {
    // 检查是否有文档字符串
    if (!code.includes('"""') && !code.includes("'''")) {
      warnings.push('建议添加文档字符串（docstring）来描述策略');
    }

    // 检查是否定义了参数
    if (!code.includes('params =') && !code.includes('params=')) {
      warnings.push('建议使用 params 定义策略参数，以便于回测时调整');
    }

    // 检查是否有日志记录
    if (!this.checkMethod(code, 'log') && !code.includes('print(')) {
      warnings.push('建议添加日志记录功能，便于调试和分析');
    }

    // 检查是否处理订单通知
    if (!this.checkMethod(code, 'notify_order')) {
      warnings.push('建议实现 notify_order() 方法来处理订单状态');
    }

    // 检查是否处理交易通知
    if (!this.checkMethod(code, 'notify_trade')) {
      warnings.push('建议实现 notify_trade() 方法来跟踪交易盈亏');
    }

    // 检查止损/止盈
    if (!code.includes('stop') && !code.includes('limit')) {
      warnings.push('建议考虑添加止损或止盈逻辑来控制风险');
    }

    // 检查资金管理
    if (!code.includes('broker') && !code.includes('cash') && !code.includes('value')) {
      warnings.push('建议实现资金管理逻辑（如固定金额、固定比例等）');
    }
  }
}

