import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MemoryManager {
  private inUseMB = 0;

  constructor(private readonly configService: ConfigService) {}

  trackChunk(barsProcessed: number) {
    const perBar = this.configService.get<number>('worker.memory.perBarMB', 0.0005);
    const maxUsage = this.configService.get<number>('worker.memory.maxUsageMB', 512);

    // 简单的滑动估算：当前使用 = 80% 旧值 + 本次新增
    const estimated = this.inUseMB * 0.8 + barsProcessed * perBar;
    this.inUseMB = Math.min(maxUsage, estimated);
  }

  getUsageMB(): number {
    return Number(this.inUseMB.toFixed(2));
  }
}
