/**
 * 执行WebSocket服务
 */

import { io, Socket } from 'socket.io-client';
import type { ExecutionMetrics, ExecutionLog, ResourceStats, AnomalyEvent } from './executionApi';

const WS_URL = 'http://localhost:3000/execution';

/**
 * WebSocket事件回调
 */
export interface ExecutionWebSocketCallbacks {
  onStatusUpdate?: (data: { sessionId: string; status: string; currentTime?: string; updatedAt: string }) => void;
  onMetricsUpdate?: (data: { sessionId: string; metrics: ExecutionMetrics }) => void;
  onLog?: (data: { sessionId: string; log: ExecutionLog }) => void;
  onResourceUpdate?: (stats: ResourceStats) => void;
  onAnomaly?: (anomaly: AnomalyEvent) => void;
  onError?: (data: { sessionId: string; error: { message: string; stack?: string }; timestamp: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * 执行WebSocket类
 */
export class ExecutionWebSocket {
  private socket: Socket | null = null;
  private callbacks: ExecutionWebSocketCallbacks = {};
  private subscribedSessions = new Set<string>();
  private isResourceSubscribed = false;

  /**
   * 连接WebSocket
   */
  connect(callbacks: ExecutionWebSocketCallbacks = {}): void {
    if (this.socket?.connected) {
      console.warn('WebSocket already connected');
      return;
    }

    this.callbacks = callbacks;

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // 连接事件
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.callbacks.onConnect?.();

      // 重新订阅之前的会话
      this.subscribedSessions.forEach((sessionId) => {
        this.subscribeSession(sessionId);
      });

      // 重新订阅资源统计
      if (this.isResourceSubscribed) {
        this.subscribeResource();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.callbacks.onDisconnect?.();
    });

    // 订阅确认
    this.socket.on('subscribed', (data: { sessionId: string }) => {
      console.log('Subscribed to session:', data.sessionId);
    });

    this.socket.on('unsubscribed', (data: { sessionId: string }) => {
      console.log('Unsubscribed from session:', data.sessionId);
    });

    this.socket.on('subscribed:resource', () => {
      console.log('Subscribed to resource stats');
    });

    this.socket.on('unsubscribed:resource', () => {
      console.log('Unsubscribed from resource stats');
    });

    // 执行事件
    this.socket.on('execution:status', (data) => {
      this.callbacks.onStatusUpdate?.(data);
    });

    this.socket.on('execution:metrics', (data) => {
      this.callbacks.onMetricsUpdate?.(data);
    });

    this.socket.on('execution:log', (data) => {
      this.callbacks.onLog?.(data);
    });

    this.socket.on('execution:resource', (stats) => {
      this.callbacks.onResourceUpdate?.(stats);
    });

    this.socket.on('execution:anomaly', (anomaly) => {
      this.callbacks.onAnomaly?.(anomaly);
    });

    this.socket.on('execution:error', (data) => {
      this.callbacks.onError?.(data);
    });
  }

  /**
   * 断开WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.subscribedSessions.clear();
      this.isResourceSubscribed = false;
    }
  }

  /**
   * 订阅会话
   */
  subscribeSession(sessionId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected');
      return;
    }

    this.socket.emit('subscribe:session', { sessionId });
    this.subscribedSessions.add(sessionId);
  }

  /**
   * 取消订阅会话
   */
  unsubscribeSession(sessionId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('unsubscribe:session', { sessionId });
    this.subscribedSessions.delete(sessionId);
  }

  /**
   * 订阅资源统计
   */
  subscribeResource(): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected');
      return;
    }

    this.socket.emit('subscribe:resource');
    this.isResourceSubscribed = true;
  }

  /**
   * 取消订阅资源统计
   */
  unsubscribeResource(): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('unsubscribe:resource');
    this.isResourceSubscribed = false;
  }

  /**
   * 更新回调
   */
  updateCallbacks(callbacks: ExecutionWebSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// 导出单例
export const executionWebSocket = new ExecutionWebSocket();

