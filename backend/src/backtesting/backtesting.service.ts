import { Injectable } from '@nestjs/common';

@Injectable()
export class BacktestingService {
  getHealth() {
    return {
      status: 'ok',
      module: 'backtesting',
      timestamp: new Date().toISOString(),
    };
  }
}
