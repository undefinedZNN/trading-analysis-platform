/**
 * 依赖注入容器实现
 * 
 * 提供服务的注册、解析和依赖管理功能
 * 
 * @module orchestrator/container/service-container
 */

import type {
  ServiceContainer,
  ServiceDescriptor,
  ServiceFactory,
  ServiceLifetime,
  DependencyNode,
} from '../interfaces/container';

import {
  ServiceLifetime as Lifetime,
  ServiceNotFoundError,
  CircularDependencyError,
  ServiceResolutionError,
} from '../interfaces/container';

// ============================================================================
// 服务容器实现
// ============================================================================

/**
 * 默认服务容器实现
 */
export class DefaultServiceContainer implements ServiceContainer {
  /** 服务描述符映射 */
  private descriptors: Map<string, ServiceDescriptor> = new Map();
  
  /** 单例实例缓存 */
  private singletonCache: Map<string, any> = new Map();
  
  /** 解析路径（用于检测循环依赖） */
  private resolutionPath: Set<string> = new Set();
  
  /**
   * 注册服务实例
   */
  registerInstance<T>(
    token: string,
    instance: T,
    lifetime: ServiceLifetime = Lifetime.Singleton
  ): void {
    this.validateToken(token);
    
    const descriptor: ServiceDescriptor<T> = {
      token,
      instance,
      lifetime,
      dependencies: [],
    };
    
    this.descriptors.set(token, descriptor);
    
    // 如果是单例，立即缓存
    if (lifetime === Lifetime.Singleton) {
      this.singletonCache.set(token, instance);
    }
  }
  
  /**
   * 注册服务工厂
   */
  registerFactory<T>(
    token: string,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime = Lifetime.Singleton,
    dependencies: string[] = []
  ): void {
    this.validateToken(token);
    
    const descriptor: ServiceDescriptor<T> = {
      token,
      factory,
      lifetime,
      dependencies,
    };
    
    this.descriptors.set(token, descriptor);
  }
  
  /**
   * 解析服务
   */
  resolve<T>(token: string): T {
    const instance = this.tryResolve<T>(token);
    
    if (instance === undefined) {
      throw new ServiceNotFoundError(token);
    }
    
    return instance;
  }
  
  /**
   * 尝试解析服务
   */
  tryResolve<T>(token: string): T | undefined {
    // 检查是否已注册
    if (!this.has(token)) {
      return undefined;
    }
    
    // 检查循环依赖
    if (this.resolutionPath.has(token)) {
      const path = Array.from(this.resolutionPath);
      path.push(token);
      throw new CircularDependencyError(path);
    }
    
    const descriptor = this.descriptors.get(token)!;
    
    // 如果是单例且已缓存，直接返回
    if (descriptor.lifetime === Lifetime.Singleton && this.singletonCache.has(token)) {
      return this.singletonCache.get(token);
    }
    
    // 解析服务
    try {
      this.resolutionPath.add(token);
      
      let instance: T;
      
      if (descriptor.instance !== undefined) {
        instance = descriptor.instance;
      } else if (descriptor.factory) {
        instance = descriptor.factory(this);
      } else {
        throw new Error('No instance or factory found');
      }
      
      // 如果是单例，缓存实例
      if (descriptor.lifetime === Lifetime.Singleton && !this.singletonCache.has(token)) {
        this.singletonCache.set(token, instance);
      }
      
      this.resolutionPath.delete(token);
      
      return instance;
    } catch (error) {
      this.resolutionPath.delete(token);
      
      // 如果是循环依赖错误，直接抛出，不要包装
      if (error instanceof CircularDependencyError) {
        throw error;
      }
      
      throw new ServiceResolutionError(token, error as Error);
    }
  }
  
  /**
   * 检查服务是否已注册
   */
  has(token: string): boolean {
    return this.descriptors.has(token);
  }
  
  /**
   * 获取服务描述符
   */
  getDescriptor(token: string): ServiceDescriptor | undefined {
    return this.descriptors.get(token);
  }
  
  /**
   * 获取所有已注册的服务 token
   */
  getRegisteredTokens(): string[] {
    return Array.from(this.descriptors.keys());
  }
  
  /**
   * 移除服务
   */
  remove(token: string): boolean {
    if (!this.has(token)) {
      return false;
    }
    
    this.descriptors.delete(token);
    this.singletonCache.delete(token);
    
    return true;
  }
  
  /**
   * 清空所有服务
   */
  clear(): void {
    this.descriptors.clear();
    this.singletonCache.clear();
    this.resolutionPath.clear();
  }
  
  /**
   * 验证依赖关系
   */
  validateDependencies(): void {
    for (const token of this.descriptors.keys()) {
      this.validateServiceDependencies(token, new Set());
    }
  }
  
  /**
   * 获取依赖树
   */
  getDependencyTree(token: string): DependencyNode {
    const descriptor = this.descriptors.get(token);
    
    if (!descriptor) {
      return {
        token,
        resolved: false,
        dependencies: [],
      };
    }
    
    const dependencies: DependencyNode[] = [];
    const visited = new Set<string>();
    
    this.buildDependencyTree(token, dependencies, visited);
    
    return {
      token,
      resolved: true,
      dependencies,
    };
  }
  
  // ==========================================================================
  // 私有辅助方法
  // ==========================================================================
  
  /**
   * 验证 token
   */
  private validateToken(token: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }
  }
  
  /**
   * 验证服务依赖关系
   */
  private validateServiceDependencies(token: string, visited: Set<string>): void {
    if (visited.has(token)) {
      const path = Array.from(visited);
      path.push(token);
      throw new CircularDependencyError(path);
    }
    
    const descriptor = this.descriptors.get(token);
    if (!descriptor || !descriptor.dependencies) {
      return;
    }
    
    visited.add(token);
    
    for (const dep of descriptor.dependencies) {
      if (!this.has(dep)) {
        throw new ServiceNotFoundError(dep);
      }
      
      this.validateServiceDependencies(dep, new Set(visited));
    }
    
    visited.delete(token);
  }
  
  /**
   * 构建依赖树
   */
  private buildDependencyTree(
    token: string,
    dependencies: DependencyNode[],
    visited: Set<string>
  ): void {
    const descriptor = this.descriptors.get(token);
    
    if (!descriptor || !descriptor.dependencies) {
      return;
    }
    
    for (const dep of descriptor.dependencies) {
      const circular = visited.has(dep);
      
      const node: DependencyNode = {
        token: dep,
        resolved: this.has(dep),
        dependencies: [],
        circular,
      };
      
      dependencies.push(node);
      
      if (!circular) {
        visited.add(dep);
        this.buildDependencyTree(dep, node.dependencies, visited);
        visited.delete(dep);
      }
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建服务容器
 * 
 * @returns 服务容器实例
 */
export function createServiceContainer(): ServiceContainer {
  return new DefaultServiceContainer();
}

