/**
 * 循环依赖检测测试
 * 
 * 测试 FeatureRegistry 能够正确检测并报告循环依赖
 */

import { FeatureRegistryImpl } from './registry';
import { FeatureDefinition } from './interfaces';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

/**
 * 测试循环依赖检测
 */
async function testCircularDependencyDetection() {
  console.log('🔄 测试循环依赖检测\n');
  
  const registry = new FeatureRegistryImpl();
  
  // 测试 1: 自引用（feature 依赖自己）
  console.log('📝 测试 1: 自引用检测');
  try {
    const selfRefFeature: FeatureDefinition = {
      id: 'self_ref',
      displayName: 'Self Reference',
      description: 'A feature that depends on itself',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'self_ref' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    registry.register(selfRefFeature);
    console.log('  ❌ FAILED: Should throw error for self-reference\n');
    return false;
  } catch (error: any) {
    if (error.message.includes('cannot depend on itself') || 
        error.message.includes('self-reference')) {
      console.log('  ✅ PASSED: Self-reference detected\n');
    } else {
      console.log(`  ❌ FAILED: Wrong error: ${error.message}\n`);
      return false;
    }
  }
  
  // 测试 2: 简单循环依赖 (A -> B -> A)
  console.log('📝 测试 2: 简单循环依赖 (A -> B -> A)');
  try {
    const registry2 = new FeatureRegistryImpl();
    
    // 注册 feature_a (依赖 feature_b)
    const featureA: FeatureDefinition = {
      id: 'feature_a',
      displayName: 'Feature A',
      description: 'Depends on feature_b',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_b' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    // 注册 feature_b (依赖 feature_a)
    const featureB: FeatureDefinition = {
      id: 'feature_b',
      displayName: 'Feature B',
      description: 'Depends on feature_a',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_a' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    // 注册两个特征（应该成功，因为不检查依赖是否存在）
    registry2.register(featureA);
    console.log('  ✅ Feature A registered (depends on feature_b)');
    registry2.register(featureB);
    console.log('  ✅ Feature B registered (depends on feature_a)');
    
    // 尝试解析（应该失败，因为存在循环依赖）
    try {
      registry2.resolve(['feature_a']);
      console.log('  ❌ FAILED: Should throw error for circular dependency\n');
      return false;
    } catch (resolveError: any) {
      if (resolveError.message.includes('Circular dependency') || 
          resolveError.message.includes('circular') ||
          resolveError.message.includes('cycle')) {
        console.log(`  ✅ PASSED: Circular dependency detected: ${resolveError.message}\n`);
      } else {
        console.log(`  ❌ FAILED: Wrong error: ${resolveError.message}\n`);
        return false;
      }
    }
  } catch (error: any) {
    console.log(`  ❌ FAILED: Unexpected error: ${error.message}\n`);
    return false;
  }
  
  // 测试 3: 复杂循环依赖 (A -> B -> C -> A)
  console.log('📝 测试 3: 复杂循环依赖 (A -> B -> C -> A)');
  try {
    const registry3 = new FeatureRegistryImpl();
    
    const featureA: FeatureDefinition = {
      id: 'feature_a',
      displayName: 'Feature A',
      description: 'Depends on feature_b',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_b' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    const featureB: FeatureDefinition = {
      id: 'feature_b',
      displayName: 'Feature B',
      description: 'Depends on feature_c',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_c' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    const featureC: FeatureDefinition = {
      id: 'feature_c',
      displayName: 'Feature C',
      description: 'Depends on feature_a',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_a' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    // 注册所有三个特征
    registry3.register(featureA);
    registry3.register(featureB);
    registry3.register(featureC);
    console.log('  ✅ All features registered');
    
    // 尝试解析（应该失败）
    try {
      registry3.resolve(['feature_a']);
      console.log('  ❌ FAILED: Should throw error for circular dependency\n');
      return false;
    } catch (resolveError: any) {
      if (resolveError.message.includes('Circular dependency') || 
          resolveError.message.includes('circular') ||
          resolveError.message.includes('cycle')) {
        console.log(`  ✅ PASSED: Circular dependency detected: ${resolveError.message}\n`);
      } else {
        console.log(`  ❌ FAILED: Wrong error: ${resolveError.message}\n`);
        return false;
      }
    }
  } catch (error: any) {
    console.log(`  ❌ FAILED: Unexpected error: ${error.message}\n`);
    return false;
  }
  
  // 测试 4: 正常依赖（无循环）
  console.log('📝 测试 4: 正常依赖（无循环）');
  try {
    const registry4 = new FeatureRegistryImpl();
    
    const featureA: FeatureDefinition = {
      id: 'feature_a',
      displayName: 'Feature A',
      description: 'No dependencies',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    const featureB: FeatureDefinition = {
      id: 'feature_b',
      displayName: 'Feature B',
      description: 'Depends on feature_a',
      category: 'test',
      version: '1.0.0',
      dependsOn: [
        { type: 'feature', ref: 'feature_a' }
      ],
      compute: (input$) => input$ as Observable<any>
    };
    
    registry4.register(featureA);
    registry4.register(featureB);
    
    // 解析应该成功
    const resolved = registry4.resolve(['feature_b']);
    
    if (resolved.length === 2 && 
        resolved[0].definition.id === 'feature_a' && 
        resolved[1].definition.id === 'feature_b') {
      console.log('  ✅ PASSED: Normal dependency resolved correctly');
      console.log(`     Resolved order: ${resolved.map(r => r.definition.id).join(' -> ')}\n`);
    } else {
      console.log('  ❌ FAILED: Incorrect resolution order\n');
      return false;
    }
  } catch (error: any) {
    console.log(`  ❌ FAILED: Unexpected error: ${error.message}\n`);
    return false;
  }
  
  return true;
}

/**
 * 主函数
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  FeatureRegistry 循环依赖检测测试');
  console.log('═══════════════════════════════════════════\n');
  
  const startTime = Date.now();
  const success = await testCircularDependencyDetection();
  const duration = Date.now() - startTime;
  
  console.log('═══════════════════════════════════════════');
  if (success) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log('❌ 测试失败');
  }
  console.log(`⏱  耗时: ${duration}ms`);
  console.log('═══════════════════════════════════════════\n');
  
  process.exit(success ? 0 : 1);
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 测试执行错误:', error);
    process.exit(1);
  });
}

export { testCircularDependencyDetection };

