import { PartialType } from '@nestjs/mapped-types';
import { CreateBacktestResultDto } from './create-backtest-result.dto';

/**
 * 更新回测结果的 DTO
 * 
 * 继承自 CreateBacktestResultDto，所有字段都是可选的
 * 
 * 注意：
 * - taskId 和 isPrimary 通常不应该被更新
 * - 主结果（is_primary=true）不应该被更新
 */
export class UpdateBacktestResultDto extends PartialType(
  CreateBacktestResultDto,
) {}

