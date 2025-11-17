import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('worker.server.port', 3001);
  const host = config.get<string>('worker.server.host', '0.0.0.0');

  await app.listen(port, host);
}

bootstrap();
