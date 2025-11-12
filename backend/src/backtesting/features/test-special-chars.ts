/**
 * 测试特殊字符特征名称支持
 */

import { FeatureRegistryImpl } from './registry';
import { FeatureDefinition } from './interfaces';
import { Observable } from 'rxjs';

async function testSpecialCharFeatureNames() {
  console.log('🧪 测试特殊字符特征名称支持\n');
  
  const registry = new FeatureRegistryImpl();
  
  // 测试 1: 带连字符和下划线的特征名
  console.log('📝 测试 1: feature_with-dash-and_underscore');
  try {
    const feature1: FeatureDefinition = {
      id: 'feature_with-dash-and_underscore',
      displayName: 'Feature with Dash and Underscore',
      description: 'Test feature with special characters',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    registry.register(feature1);
    console.log('  ✅ PASSED: Registered successfully\n');
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    return false;
  }
  
  // 测试 2: 带点号的特征名（命名空间风格）
  console.log('📝 测试 2: my.namespace.FeatureName');
  try {
    const registry2 = new FeatureRegistryImpl();
    
    const feature2: FeatureDefinition = {
      id: 'my.namespace.FeatureName',
      displayName: 'Namespaced Feature',
      description: 'Test feature with dot notation',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    registry2.register(feature2);
    console.log('  ✅ PASSED: Registered successfully\n');
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    return false;
  }
  
  // 测试 3: 混合所有允许的特殊字符
  console.log('📝 测试 3: feature_with-dash.and_underscore');
  try {
    const registry3 = new FeatureRegistryImpl();
    
    const feature3: FeatureDefinition = {
      id: 'feature_with-dash.and_underscore',
      displayName: 'Mixed Special Chars',
      description: 'Test feature with all special characters',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    registry3.register(feature3);
    console.log('  ✅ PASSED: Registered successfully\n');
  } catch (error: any) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    return false;
  }
  
  // 测试 4: 无效的特征名（不以字母开头）
  console.log('📝 测试 4: 123_invalid (should fail)');
  try {
    const registry4 = new FeatureRegistryImpl();
    
    const feature4: FeatureDefinition = {
      id: '123_invalid',
      displayName: 'Invalid Feature',
      description: 'Test invalid feature name',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    registry4.register(feature4);
    console.log('  ❌ FAILED: Should have thrown error\n');
    return false;
  } catch (error: any) {
    if (error.message.includes('Invalid feature ID')) {
      console.log('  ✅ PASSED: Correctly rejected invalid ID\n');
    } else {
      console.log(`  ❌ FAILED: Wrong error: ${error.message}\n`);
      return false;
    }
  }
  
  // 测试 5: 无效的特征名（包含空格）
  console.log('📝 测试 5: feature with spaces (should fail)');
  try {
    const registry5 = new FeatureRegistryImpl();
    
    const feature5: FeatureDefinition = {
      id: 'feature with spaces',
      displayName: 'Invalid Feature',
      description: 'Test invalid feature name',
      category: 'test',
      version: '1.0.0',
      compute: (input$) => input$ as Observable<any>
    };
    
    registry5.register(feature5);
    console.log('  ❌ FAILED: Should have thrown error\n');
    return false;
  } catch (error: any) {
    if (error.message.includes('Invalid feature ID')) {
      console.log('  ✅ PASSED: Correctly rejected invalid ID\n');
    } else {
      console.log(`  ❌ FAILED: Wrong error: ${error.message}\n`);
      return false;
    }
  }
  
  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  特殊字符特征名称支持测试');
  console.log('═══════════════════════════════════════════\n');
  
  const startTime = Date.now();
  const success = await testSpecialCharFeatureNames();
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

export { testSpecialCharFeatureNames };

