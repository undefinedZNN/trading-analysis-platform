/**
 * 执行WebSocket网关
 * 
 * 负责实时推送执行状态、指标和日志
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ExecutionSession,
  ExecutionMetrics,
  ExecutionLog,
} from './interfaces/execution.interface';
import { ResourceStats, AnomalyEvent } from './services/execution-monitor.service';

/**
 * 订阅消息
 */
interface SubscribeMessage {
  sessionId: string;
}

/**
 * 执行WebSocket网关
 */
@WebSocketGateway({
  namespace: '/execution',
  cors: {
    origin: '*',
  },
})
export class ExecutionGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ExecutionGateway.name);

  // 会话订阅映射 (sessionId -> Set<socketId>)
  private sessionSubscribers = new Map<string, Set<string>>();

  /**
   * 网关初始化
   */
  afterInit(server: Server): void {
    this.logger.log('WebSocket Gateway initialized');
  }

  /**
   * 客户端连接
   */
  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  /**
   * 客户端断开
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    // 清理订阅
    for (const [sessionId, subscribers] of this.sessionSubscribers.entries()) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.sessionSubscribers.delete(sessionId);
      }
    }
  }

  /**
   * 订阅执行会话
   */
  @SubscribeMessage('subscribe:session')
  handleSubscribeSession(
    @MessageBody() data: SubscribeMessage,
    @ConnectedSocket() client: Socket,
  ): void {
    const { sessionId } = data;

    this.logger.log(`Client ${client.id} subscribing to session ${sessionId}`);

    // 添加到订阅列表
    let subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers) {
      subscribers = new Set();
      this.sessionSubscribers.set(sessionId, subscribers);
    }
    subscribers.add(client.id);

    // 确认订阅
    client.emit('subscribed', { sessionId });
  }

  /**
   * 取消订阅执行会话
   */
  @SubscribeMessage('unsubscribe:session')
  handleUnsubscribeSession(
    @MessageBody() data: SubscribeMessage,
    @ConnectedSocket() client: Socket,
  ): void {
    const { sessionId } = data;

    this.logger.log(`Client ${client.id} unsubscribing from session ${sessionId}`);

    // 从订阅列表移除
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.sessionSubscribers.delete(sessionId);
      }
    }

    // 确认取消订阅
    client.emit('unsubscribed', { sessionId });
  }

  /**
   * 订阅系统资源
   */
  @SubscribeMessage('subscribe:resource')
  handleSubscribeResource(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Client ${client.id} subscribing to resource stats`);

    // 加入资源统计房间
    client.join('resource');

    // 确认订阅
    client.emit('subscribed:resource');
  }

  /**
   * 取消订阅系统资源
   */
  @SubscribeMessage('unsubscribe:resource')
  handleUnsubscribeResource(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Client ${client.id} unsubscribing from resource stats`);

    // 离开资源统计房间
    client.leave('resource');

    // 确认取消订阅
    client.emit('unsubscribed:resource');
  }

  /**
   * 推送执行状态更新
   * 
   * @param sessionId 会话ID
   * @param session 执行会话
   */
  pushStatusUpdate(sessionId: string, session: ExecutionSession): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // 推送给订阅者
    for (const socketId of subscribers) {
      this.server.to(socketId).emit('execution:status', {
        sessionId,
        status: session.status,
        currentTime: session.currentTime,
        updatedAt: new Date(),
      });
    }
  }

  /**
   * 监听指标更新事件
   */
  @OnEvent('execution.metrics')
  handleMetricsEvent(data: { sessionId: string; metrics: ExecutionMetrics }): void {
    const { sessionId, metrics } = data;

    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // 推送给订阅者
    for (const socketId of subscribers) {
      this.server.to(socketId).emit('execution:metrics', {
        sessionId,
        metrics,
      });
    }
  }

  /**
   * 推送日志
   * 
   * @param sessionId 会话ID
   * @param log 执行日志
   */
  pushLog(sessionId: string, log: ExecutionLog): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // 推送给订阅者
    for (const socketId of subscribers) {
      this.server.to(socketId).emit('execution:log', {
        sessionId,
        log,
      });
    }
  }

  /**
   * 监听资源统计事件
   */
  @OnEvent('execution.resource')
  handleResourceEvent(stats: ResourceStats): void {
    // 推送给资源统计订阅者
    this.server.to('resource').emit('execution:resource', stats);
  }

  /**
   * 监听异常事件
   */
  @OnEvent('execution.anomaly')
  handleAnomalyEvent(anomaly: AnomalyEvent): void {
    const { sessionId } = anomaly;

    if (sessionId === 'system') {
      // 系统级异常,推送给所有客户端
      this.server.emit('execution:anomaly', anomaly);
    } else {
      // 会话级异常,推送给订阅者
      const subscribers = this.sessionSubscribers.get(sessionId);
      if (subscribers && subscribers.size > 0) {
        for (const socketId of subscribers) {
          this.server.to(socketId).emit('execution:anomaly', anomaly);
        }
      }
    }
  }

  /**
   * 推送错误
   * 
   * @param sessionId 会话ID
   * @param error 错误信息
   */
  pushError(sessionId: string, error: { message: string; stack?: string }): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // 推送给订阅者
    for (const socketId of subscribers) {
      this.server.to(socketId).emit('execution:error', {
        sessionId,
        error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 广播消息
   * 
   * @param event 事件名称
   * @param data 数据
   */
  broadcast(event: string, data: any): void {
    this.server.emit(event, data);
  }

  /**
   * 获取统计信息
   * 
   * @returns 统计信息
   */
  getStats(): {
    connectedClients: number;
    subscribedSessions: number;
    totalSubscribers: number;
  } {
    const totalSubscribers = Array.from(this.sessionSubscribers.values()).reduce(
      (sum, subscribers) => sum + subscribers.size,
      0,
    );

    return {
      connectedClients: this.server.sockets.sockets.size,
      subscribedSessions: this.sessionSubscribers.size,
      totalSubscribers,
    };
  }
}

