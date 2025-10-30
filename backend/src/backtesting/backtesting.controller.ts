import { Controller, Get } from '@nestjs/common';
import { BacktestingService } from './backtesting.service';

@Controller('backtesting')
export class BacktestingController {
  constructor(private readonly backtestingService: BacktestingService) {}

  @Get('health')
  checkHealth() {
    return this.backtestingService.getHealth();
  }
}
