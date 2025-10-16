import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '欢迎使用交易分析平台 API 🚀';
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'trading-analysis-backend',
      version: '1.0.0',
      environment: 'development',
      message: '服务运行正常',
    };
  }
}
