import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';

@Injectable()
export class StrategyScriptCompiler {
  compile(sourceCode: string): { compiledCode: string } {
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2019,
        module: ts.ModuleKind.CommonJS,
        isolatedModules: true,
        strict: false,
        esModuleInterop: true,
      },
      reportDiagnostics: false,
    });

    return {
      compiledCode: result.outputText,
    };
  }
}
