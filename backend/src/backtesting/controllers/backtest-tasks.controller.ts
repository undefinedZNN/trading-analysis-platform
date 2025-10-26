import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BacktestTasksService } from '../services/backtest-tasks.service';
import {
  CreateBacktestTaskDto,
  UpdateBacktestTaskDto,
  UpdateBacktestTaskStatusDto,
  ListBacktestTasksQueryDto,
} from '../dto/backtest-task.dto';

@Controller('backtesting/tasks')
export class BacktestTasksController {
  constructor(private readonly tasksService: BacktestTasksService) {}

  /**
   * 创建回测任务
   */
  @Post()
  async createTask(@Body() dto: CreateBacktestTaskDto) {
    return await this.tasksService.createTask(dto);
  }

  /**
   * 查询回测任务列表
   */
  @Get()
  async listTasks(@Query() query: ListBacktestTasksQueryDto) {
    return await this.tasksService.listTasks(query);
  }

  /**
   * 获取回测任务详情
   */
  @Get(':taskId')
  async getTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return await this.tasksService.getTask(taskId);
  }

  /**
   * 更新回测任务基本信息
   */
  @Patch(':taskId')
  async updateTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateBacktestTaskDto,
  ) {
    return await this.tasksService.updateTask(taskId, dto);
  }

  /**
   * 更新回测任务状态
   */
  @Patch(':taskId/status')
  async updateTaskStatus(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateBacktestTaskStatusDto,
  ) {
    return await this.tasksService.updateTaskStatus(taskId, dto);
  }

  /**
   * 取消回测任务
   */
  @Post(':taskId/cancel')
  async cancelTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return await this.tasksService.cancelTask(taskId);
  }

  /**
   * 删除回测任务
   */
  @Delete(':taskId')
  async deleteTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body?: { operator?: string },
  ) {
    await this.tasksService.deleteTask(taskId, body?.operator);
    return { message: '删除成功' };
  }
}

