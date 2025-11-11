// backend/src/backtesting/strategy/strategy.module.ts

import { Module } from '@nestjs/common';
import { SchemaValidatorService } from './validators/schema-validator.service';
import { TypeScriptCheckerService } from './validators/typescript-checker.service';
import { ESLintCheckerService } from './validators/eslint-checker.service';
import { StrategyCompilerService } from './compiler.service';

@Module({
  providers: [
    SchemaValidatorService,
    TypeScriptCheckerService,
    ESLintCheckerService,
    StrategyCompilerService,
  ],
  exports: [
    SchemaValidatorService,
    TypeScriptCheckerService,
    ESLintCheckerService,
    StrategyCompilerService,
  ],
})
export class StrategyModule {}

