/**
 * 依赖注入容器单元测试
 * 
 * 测试：
 * - 服务注册（实例和工厂）
 * - 服务解析（单例和瞬态）
 * - 循环依赖检测
 * - 依赖树构建
 * - 容器管理功能
 * 
 * @module orchestrator/__tests__/container.test
 */

import {
  createServiceContainer,
  ServiceLifetime,
  ServiceNotFoundError,
  CircularDependencyError,
  ServiceTokens,
} from '../container';

// ============================================================================
// 测试框架
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(description: string, fn: () => void): void {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✅ ${description}`);
  } catch (error: any) {
    failCount++;
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ============================================================================
// 测试套件
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║          M3-01-B: 依赖注入容器单元测试                         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ----------------------------------------------------------------------------
// 服务注册测试
// ----------------------------------------------------------------------------

console.log('## 服务注册测试\n');

test('注册服务实例 - 应该成功注册', () => {
  const container = createServiceContainer();
  const instance = { name: 'TestService' };
  
  container.registerInstance('test-service', instance);
  
  assert(container.has('test-service'), 'Service should be registered');
});

test('注册服务工厂 - 应该成功注册', () => {
  const container = createServiceContainer();
  const factory = () => ({ name: 'TestService' });
  
  container.registerFactory('test-service', factory);
  
  assert(container.has('test-service'), 'Service should be registered');
});

test('注册多个服务 - 应该都能注册', () => {
  const container = createServiceContainer();
  
  container.registerInstance('service-1', { id: 1 });
  container.registerInstance('service-2', { id: 2 });
  container.registerInstance('service-3', { id: 3 });
  
  assert(container.has('service-1'), 'Service 1 should be registered');
  assert(container.has('service-2'), 'Service 2 should be registered');
  assert(container.has('service-3'), 'Service 3 should be registered');
});

// ----------------------------------------------------------------------------
// 服务解析测试
// ----------------------------------------------------------------------------

console.log('\n## 服务解析测试\n');

test('解析已注册的实例 - 应该返回实例', () => {
  const container = createServiceContainer();
  const instance = { name: 'TestService' };
  
  container.registerInstance('test-service', instance);
  const resolved = container.resolve<typeof instance>('test-service');
  
  assert(resolved === instance, 'Should return the same instance');
});

test('解析工厂服务 - 应该调用工厂创建实例', () => {
  const container = createServiceContainer();
  let factoryCalled = false;
  
  container.registerFactory('test-service', () => {
    factoryCalled = true;
    return { name: 'TestService' };
  });
  
  const resolved = container.resolve<any>('test-service');
  
  assert(factoryCalled, 'Factory should be called');
  assert(resolved.name === 'TestService', 'Should return factory result');
});

test('解析未注册的服务 - 应该抛出异常', () => {
  const container = createServiceContainer();
  
  let thrown = false;
  try {
    container.resolve('non-existent');
  } catch (error) {
    thrown = true;
    assert(error instanceof ServiceNotFoundError, 'Should throw ServiceNotFoundError');
  }
  
  assert(thrown, 'Should throw exception');
});

test('tryResolve 未注册的服务 - 应该返回 undefined', () => {
  const container = createServiceContainer();
  
  const resolved = container.tryResolve('non-existent');
  
  assert(resolved === undefined, 'Should return undefined');
});

// ----------------------------------------------------------------------------
// 生命周期测试
// ----------------------------------------------------------------------------

console.log('\n## 生命周期测试\n');

test('单例模式 - 应该返回同一个实例', () => {
  const container = createServiceContainer();
  let callCount = 0;
  
  container.registerFactory(
    'test-service',
    () => {
      callCount++;
      return { id: callCount };
    },
    ServiceLifetime.Singleton
  );
  
  const first = container.resolve<any>('test-service');
  const second = container.resolve<any>('test-service');
  
  assert(callCount === 1, 'Factory should only be called once');
  assert(first === second, 'Should return the same instance');
  assert(first.id === 1, 'Should have the correct ID');
});

test('瞬态模式 - 应该每次返回新实例', () => {
  const container = createServiceContainer();
  let callCount = 0;
  
  container.registerFactory(
    'test-service',
    () => {
      callCount++;
      return { id: callCount };
    },
    ServiceLifetime.Transient
  );
  
  const first = container.resolve<any>('test-service');
  const second = container.resolve<any>('test-service');
  
  assert(callCount === 2, 'Factory should be called twice');
  assert(first !== second, 'Should return different instances');
  assert(first.id === 1, 'First instance should have ID 1');
  assert(second.id === 2, 'Second instance should have ID 2');
});

// ----------------------------------------------------------------------------
// 依赖注入测试
// ----------------------------------------------------------------------------

console.log('\n## 依赖注入测试\n');

test('解析有依赖的服务 - 应该自动解析依赖', () => {
  const container = createServiceContainer();
  
  // 注册依赖
  container.registerInstance('config', { port: 3000 });
  
  // 注册依赖于 config 的服务
  container.registerFactory(
    'server',
    (c) => {
      const config = c.resolve<any>('config');
      return { port: config.port, running: true };
    },
    ServiceLifetime.Singleton,
    ['config']
  );
  
  const server = container.resolve<any>('server');
  
  assert(server.port === 3000, 'Should resolve with correct port');
  assert(server.running === true, 'Should have running flag');
});

test('多层依赖 - 应该正确解析', () => {
  const container = createServiceContainer();
  
  // A -> B -> C
  container.registerInstance('service-c', { name: 'C' });
  
  container.registerFactory(
    'service-b',
    (c) => {
      const serviceC = c.resolve<any>('service-c');
      return { name: 'B', dep: serviceC };
    },
    ServiceLifetime.Singleton,
    ['service-c']
  );
  
  container.registerFactory(
    'service-a',
    (c) => {
      const serviceB = c.resolve<any>('service-b');
      return { name: 'A', dep: serviceB };
    },
    ServiceLifetime.Singleton,
    ['service-b']
  );
  
  const serviceA = container.resolve<any>('service-a');
  
  assert(serviceA.name === 'A', 'Service A should be resolved');
  assert(serviceA.dep.name === 'B', 'Service B should be resolved');
  assert(serviceA.dep.dep.name === 'C', 'Service C should be resolved');
});

// ----------------------------------------------------------------------------
// 循环依赖测试
// ----------------------------------------------------------------------------

console.log('\n## 循环依赖测试\n');

test('直接循环依赖 - 应该抛出异常', () => {
  const container = createServiceContainer();
  
  // A -> A (自己依赖自己)
  container.registerFactory(
    'service-a',
    (c) => {
      const a = c.resolve('service-a');
      return { name: 'A', dep: a };
    },
    ServiceLifetime.Singleton,
    ['service-a']
  );
  
  let thrown = false;
  let error: any = null;
  try {
    container.resolve('service-a');
  } catch (e) {
    thrown = true;
    error = e;
  }
  
  assert(thrown, 'Should throw exception');
  assert(error instanceof CircularDependencyError || error.name === 'CircularDependencyError', 
    `Should throw CircularDependencyError, but got: ${error?.constructor?.name || error?.name}`);
});

test('间接循环依赖 - 应该抛出异常', () => {
  const container = createServiceContainer();
  
  // A -> B -> A
  container.registerFactory(
    'service-b',
    (c) => {
      const a = c.resolve('service-a');
      return { name: 'B', dep: a };
    },
    ServiceLifetime.Singleton,
    ['service-a']
  );
  
  container.registerFactory(
    'service-a',
    (c) => {
      const b = c.resolve('service-b');
      return { name: 'A', dep: b };
    },
    ServiceLifetime.Singleton,
    ['service-b']
  );
  
  let thrown = false;
  let error: any = null;
  try {
    container.resolve('service-a');
  } catch (e) {
    thrown = true;
    error = e;
  }
  
  assert(thrown, 'Should throw exception');
  assert(error instanceof CircularDependencyError || error.name === 'CircularDependencyError', 
    `Should throw CircularDependencyError, but got: ${error?.constructor?.name || error?.name}`);
});

// ----------------------------------------------------------------------------
// 容器管理测试
// ----------------------------------------------------------------------------

console.log('\n## 容器管理测试\n');

test('getRegisteredTokens - 应该返回所有已注册的 token', () => {
  const container = createServiceContainer();
  
  container.registerInstance('service-1', { id: 1 });
  container.registerInstance('service-2', { id: 2 });
  container.registerInstance('service-3', { id: 3 });
  
  const tokens = container.getRegisteredTokens();
  
  assert(tokens.length === 3, 'Should have 3 tokens');
  assert(tokens.includes('service-1'), 'Should include service-1');
  assert(tokens.includes('service-2'), 'Should include service-2');
  assert(tokens.includes('service-3'), 'Should include service-3');
});

test('remove - 应该移除服务', () => {
  const container = createServiceContainer();
  
  container.registerInstance('test-service', { name: 'Test' });
  
  assert(container.has('test-service'), 'Service should exist');
  
  const removed = container.remove('test-service');
  
  assert(removed === true, 'Should return true');
  assert(!container.has('test-service'), 'Service should be removed');
});

test('clear - 应该清空所有服务', () => {
  const container = createServiceContainer();
  
  container.registerInstance('service-1', { id: 1 });
  container.registerInstance('service-2', { id: 2 });
  container.registerInstance('service-3', { id: 3 });
  
  container.clear();
  
  assert(container.getRegisteredTokens().length === 0, 'Should have no services');
  assert(!container.has('service-1'), 'Service 1 should be removed');
  assert(!container.has('service-2'), 'Service 2 should be removed');
  assert(!container.has('service-3'), 'Service 3 should be removed');
});

test('getDescriptor - 应该返回服务描述符', () => {
  const container = createServiceContainer();
  const instance = { name: 'Test' };
  
  container.registerInstance('test-service', instance);
  
  const descriptor = container.getDescriptor('test-service');
  
  assert(descriptor !== undefined, 'Descriptor should exist');
  assert(descriptor!.token === 'test-service', 'Token should match');
  assert(descriptor!.instance === instance, 'Instance should match');
  assert(descriptor!.lifetime === ServiceLifetime.Singleton, 'Lifetime should be singleton');
});

// ----------------------------------------------------------------------------
// 依赖树测试
// ----------------------------------------------------------------------------

console.log('\n## 依赖树测试\n');

test('getDependencyTree - 无依赖服务', () => {
  const container = createServiceContainer();
  
  container.registerInstance('service-a', { name: 'A' });
  
  const tree = container.getDependencyTree('service-a');
  
  assert(tree.token === 'service-a', 'Root token should match');
  assert(tree.resolved === true, 'Should be resolved');
  assert(tree.dependencies.length === 0, 'Should have no dependencies');
});

test('getDependencyTree - 有依赖服务', () => {
  const container = createServiceContainer();
  
  container.registerInstance('service-b', { name: 'B' });
  container.registerFactory(
    'service-a',
    (c) => ({ name: 'A', dep: c.resolve('service-b') }),
    ServiceLifetime.Singleton,
    ['service-b']
  );
  
  const tree = container.getDependencyTree('service-a');
  
  assert(tree.token === 'service-a', 'Root token should match');
  assert(tree.resolved === true, 'Should be resolved');
  assert(tree.dependencies.length === 1, 'Should have 1 dependency');
  assert(tree.dependencies[0].token === 'service-b', 'Dependency should be service-b');
});

// ============================================================================
// 测试总结
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                   测试总结                                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`总测试数: ${testCount}`);
console.log(`✅ 通过: ${passCount}`);
console.log(`❌ 失败: ${failCount}`);
console.log(`成功率: ${((passCount / testCount) * 100).toFixed(1)}%\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 所有依赖注入容器测试通过！\n');
  process.exit(0);
}

