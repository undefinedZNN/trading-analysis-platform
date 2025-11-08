/**
 * 依赖注入容器接口定义
 * 
 * 提供服务的注册、解析和依赖管理功能
 * 
 * @module orchestrator/interfaces/container
 */

// ============================================================================
// 服务生命周期
// ============================================================================

/**
 * 服务生命周期类型
 */
export enum ServiceLifetime {
  /** 单例 - 在容器中只创建一次 */
  Singleton = 'singleton',
  
  /** 瞬态 - 每次解析都创建新实例 */
  Transient = 'transient',
  
  /** 作用域 - 在同一作用域内共享实例（暂未实现） */
  Scoped = 'scoped',
}

// ============================================================================
// 服务描述符
// ============================================================================

/**
 * 服务工厂函数
 */
export type ServiceFactory<T = any> = (container: ServiceContainer) => T;

/**
 * 服务描述符
 */
export interface ServiceDescriptor<T = any> {
  /** 服务 token */
  token: string;
  
  /** 服务实例（如果已注册实例） */
  instance?: T;
  
  /** 服务工厂函数（如果已注册工厂） */
  factory?: ServiceFactory<T>;
  
  /** 服务生命周期 */
  lifetime: ServiceLifetime;
  
  /** 依赖的其他服务 token 列表 */
  dependencies?: string[];
  
  /** 服务元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 容器接口
// ============================================================================

/**
 * 依赖注入容器接口
 */
export interface ServiceContainer {
  /**
   * 注册服务实例
   * 
   * @param token 服务 token
   * @param instance 服务实例
   * @param lifetime 生命周期（默认为单例）
   */
  registerInstance<T>(
    token: string,
    instance: T,
    lifetime?: ServiceLifetime
  ): void;
  
  /**
   * 注册服务工厂
   * 
   * @param token 服务 token
   * @param factory 服务工厂函数
   * @param lifetime 生命周期（默认为单例）
   * @param dependencies 依赖的服务 token 列表
   */
  registerFactory<T>(
    token: string,
    factory: ServiceFactory<T>,
    lifetime?: ServiceLifetime,
    dependencies?: string[]
  ): void;
  
  /**
   * 解析服务
   * 
   * @param token 服务 token
   * @returns 服务实例
   * @throws 如果服务未注册或解析失败
   */
  resolve<T>(token: string): T;
  
  /**
   * 尝试解析服务
   * 
   * @param token 服务 token
   * @returns 服务实例或 undefined
   */
  tryResolve<T>(token: string): T | undefined;
  
  /**
   * 检查服务是否已注册
   * 
   * @param token 服务 token
   * @returns 是否已注册
   */
  has(token: string): boolean;
  
  /**
   * 获取服务描述符
   * 
   * @param token 服务 token
   * @returns 服务描述符或 undefined
   */
  getDescriptor(token: string): ServiceDescriptor | undefined;
  
  /**
   * 获取所有已注册的服务 token
   * 
   * @returns 服务 token 列表
   */
  getRegisteredTokens(): string[];
  
  /**
   * 移除服务
   * 
   * @param token 服务 token
   * @returns 是否成功移除
   */
  remove(token: string): boolean;
  
  /**
   * 清空所有服务
   */
  clear(): void;
  
  /**
   * 验证依赖关系
   * 
   * @throws 如果存在循环依赖或缺失依赖
   */
  validateDependencies(): void;
  
  /**
   * 获取依赖树
   * 
   * @param token 服务 token
   * @returns 依赖树
   */
  getDependencyTree(token: string): DependencyNode;
}

// ============================================================================
// 依赖树
// ============================================================================

/**
 * 依赖节点
 */
export interface DependencyNode {
  /** 服务 token */
  token: string;
  
  /** 是否已解析 */
  resolved: boolean;
  
  /** 依赖的子节点 */
  dependencies: DependencyNode[];
  
  /** 是否存在循环依赖 */
  circular?: boolean;
}

// ============================================================================
// 容器异常
// ============================================================================

/**
 * 容器异常基类
 */
export class ContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContainerError';
  }
}

/**
 * 服务未注册异常
 */
export class ServiceNotFoundError extends ContainerError {
  constructor(token: string) {
    super(`Service not found: ${token}`);
    this.name = 'ServiceNotFoundError';
  }
}

/**
 * 循环依赖异常
 */
export class CircularDependencyError extends ContainerError {
  constructor(path: string[]) {
    super(`Circular dependency detected: ${path.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * 服务解析失败异常
 */
export class ServiceResolutionError extends ContainerError {
  constructor(token: string, cause?: Error) {
    super(`Failed to resolve service: ${token}${cause ? ` - ${cause.message}` : ''}`);
    this.name = 'ServiceResolutionError';
  }
}

