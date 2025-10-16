import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('应用接口')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Hello World 接口' })
  @ApiResponse({ 
    status: 200, 
    description: '返回欢迎消息',
    schema: {
      type: 'string',
      example: '欢迎使用交易分析平台 API 🚀'
    }
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查接口' })
  @ApiResponse({ 
    status: 200, 
    description: '返回应用健康状态',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2025-10-16T12:00:00.000Z' },
        service: { type: 'string', example: 'trading-analysis-backend' },
        version: { type: 'string', example: '1.0.0' },
        environment: { type: 'string', example: 'development' }
      }
    }
  })
  getHealth() {
    return this.appService.getHealth();
  }
}
