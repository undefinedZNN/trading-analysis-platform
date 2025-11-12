import { PartialType } from '@nestjs/swagger';
import { CreateBacktestTaskDto } from './create-backtest-task.dto';

/**
 * 更新回测任务 DTO
 * 
 * 继承自 CreateBacktestTaskDto，所有字段可选
 */
export class UpdateBacktestTaskDto extends PartialType(CreateBacktestTaskDto) {}

