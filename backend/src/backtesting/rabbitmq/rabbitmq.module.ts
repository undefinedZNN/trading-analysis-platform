import { Module, Global } from '@nestjs/common';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';

/**
 * RabbitMQ 模块
 * 
 * 提供RabbitMQ连接管理和消息发布服务
 * 标记为@Global，使其在整个应用中可用
 */
@Global()
@Module({
  providers: [
    RabbitMQConnectionService,
    RabbitMQPublisherService,
  ],
  exports: [
    RabbitMQConnectionService,
    RabbitMQPublisherService,
  ],
})
export class RabbitMQModule {}


