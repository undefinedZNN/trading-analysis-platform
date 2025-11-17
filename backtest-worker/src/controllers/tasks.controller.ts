import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  CancelTaskDto,
  ExecuteTaskDto,
  TaskStatusDto,
} from '@trading-platform/backtesting-contracts';
import { BacktestExecutor } from '../executor/backtest-executor';
import { WorkerRegistrationService } from '../registration/worker-registration.service';

@Controller()
export class TasksController {
  constructor(
    private readonly executor: BacktestExecutor,
    private readonly registration: WorkerRegistrationService,
  ) {}

  @Post('execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async execute(@Body() body: ExecuteTaskDto) {
    const { taskId, config } = body;

    await this.registration.ensureRegistered();
    this.executor
      .execute(taskId, config)
      .catch((error) => this.registration.reportFailure(taskId, error));

    return {
      taskId,
      workerId: this.registration.workerId,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    };
  }

  @Post('tasks/:taskId/cancel')
  cancel(@Param('taskId') taskId: string, @Body() body: CancelTaskDto) {
    this.executor.cancel(taskId);
    return {
      taskId,
      status: 'cancelled',
      reason: body?.reason,
    };
  }

  @Get('tasks/:taskId/status')
  getStatus(@Param('taskId') taskId: string): TaskStatusDto {
    return this.executor.getTaskStatus(taskId);
  }
}
