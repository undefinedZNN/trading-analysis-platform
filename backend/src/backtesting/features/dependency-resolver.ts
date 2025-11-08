/**
 * DependencyResolver - 依赖解析器
 * 
 * 负责解析特征依赖关系，执行拓扑排序，检测循环依赖
 */

import {
  FeatureConfig,
  FeatureDefinition,
  ResolvedFeature,
  DependencyGraph,
  DependencyNode,
} from './interfaces';

/**
 * 依赖解析器实现
 */
export class DependencyResolver {
  /**
   * 特征注册表的引用
   */
  private getFeature: (id: string) => FeatureDefinition | undefined;

  constructor(getFeature: (id: string) => FeatureDefinition | undefined) {
    this.getFeature = getFeature;
  }

  /**
   * 解析特征配置列表
   * 
   * @param featureConfigs 特征配置列表
   * @param mergedParams 参数合并函数
   * @returns 已解析并排序的特征列表
   */
  resolve(
    featureConfigs: FeatureConfig[],
    mergedParams: (def: FeatureDefinition, params?: Record<string, unknown>) => Record<string, unknown>
  ): ResolvedFeature[] {
    // 1. 展开所有特征（包括隐式依赖）
    const expanded = this.expandDependencies(featureConfigs);

    // 2. 构建依赖图
    const graph = this.buildDependencyGraph(expanded);

    // 3. 检测循环依赖
    this.detectCycles(graph);

    // 4. 拓扑排序
    const sorted = this.topologicalSort(graph);

    // 5. 构建 ResolvedFeature 对象
    return sorted.map((node, index) => {
      const definition = this.getFeature(node.config.id);
      if (!definition) {
        throw new Error(`Feature definition not found: ${node.config.id}`);
      }

      const outputId = node.config.outputId || node.config.id;
      const params = mergedParams(definition, node.config.params);

      // 提取特征类型的依赖
      const featureDeps = (definition.dependsOn || [])
        .filter(dep => dep.type === 'feature')
        .map(dep => dep.ref);

      return {
        definition,
        outputId,
        params,
        dependencies: featureDeps,
        order: index,
        isImplicit: node.config.label === undefined, // 如果没有label，认为是隐式依赖
      };
    });
  }

  /**
   * 展开依赖（包括隐式依赖的特征）
   * 
   * @param configs 特征配置列表
   * @returns 展开后的配置列表
   */
  private expandDependencies(configs: FeatureConfig[]): FeatureConfig[] {
    const expanded = new Map<string, FeatureConfig>();
    const queue: FeatureConfig[] = [...configs];

    while (queue.length > 0) {
      const config = queue.shift()!;
      const outputId = config.outputId || config.id;

      // 避免重复处理
      if (expanded.has(outputId)) {
        continue;
      }

      const definition = this.getFeature(config.id);
      if (!definition) {
        throw new Error(`Feature not registered: ${config.id}`);
      }

      expanded.set(outputId, config);

      // 添加依赖的特征（不包括字段依赖）
      if (definition.dependsOn) {
        for (const dep of definition.dependsOn) {
          if (dep.type === 'feature' && !expanded.has(dep.ref)) {
            queue.push({
              id: dep.ref,
              outputId: dep.ref,
              // 隐式依赖不设置label
            });
          }
        }
      }
    }

    return Array.from(expanded.values());
  }

  /**
   * 构建依赖图
   * 
   * @param configs 特征配置列表
   * @returns 依赖图
   */
  private buildDependencyGraph(configs: FeatureConfig[]): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const adjacencyList = new Map<string, string[]>();

    // 创建节点
    for (const config of configs) {
      const outputId = config.outputId || config.id;
      const definition = this.getFeature(config.id);
      
      if (!definition) {
        throw new Error(`Feature not registered: ${config.id}`);
      }

      // 提取特征类型的依赖
      const featureDeps = (definition.dependsOn || [])
        .filter(dep => dep.type === 'feature')
        .map(dep => dep.ref);

      nodes.set(outputId, {
        id: outputId,
        config,
        dependencies: featureDeps,
      });

      // 初始化邻接表
      if (!adjacencyList.has(outputId)) {
        adjacencyList.set(outputId, []);
      }
    }

    // 构建邻接表（反向：被依赖者 -> 依赖者）
    for (const node of nodes.values()) {
      for (const depId of node.dependencies) {
        if (!adjacencyList.has(depId)) {
          adjacencyList.set(depId, []);
        }
        adjacencyList.get(depId)!.push(node.id);
      }
    }

    return { nodes, adjacencyList };
  }

  /**
   * 检测循环依赖
   * 
   * @param graph 依赖图
   * @throws 如果检测到循环依赖
   */
  private detectCycles(graph: DependencyGraph): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            dfs(depId, path);
          } else if (recursionStack.has(depId)) {
            // 检测到循环
            const cycleStart = path.indexOf(depId);
            const cycle = path.slice(cycleStart).concat(depId);
            throw new Error(
              `Circular dependency detected: ${cycle.join(' -> ')}`
            );
          }
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }
  }

  /**
   * 拓扑排序（Kahn算法）
   * 
   * @param graph 依赖图
   * @returns 排序后的节点列表
   */
  private topologicalSort(graph: DependencyGraph): DependencyNode[] {
    const result: DependencyNode[] = [];
    const inDegree = new Map<string, number>();

    // 计算每个节点的入度
    for (const node of graph.nodes.values()) {
      if (!inDegree.has(node.id)) {
        inDegree.set(node.id, 0);
      }
      for (const depId of node.dependencies) {
        inDegree.set(depId, (inDegree.get(depId) || 0) + 0); // 确保依赖节点也在map中
      }
    }

    // 正确计算入度：对于每个节点，其依赖的数量就是它的入度
    for (const node of graph.nodes.values()) {
      inDegree.set(node.id, node.dependencies.length);
    }

    // 找到所有入度为0的节点
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Kahn算法
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = graph.nodes.get(nodeId);
      
      if (node) {
        result.push(node);

        // 对于所有依赖当前节点的节点，减少其入度
        const dependents = graph.adjacencyList.get(nodeId) || [];
        for (const depId of dependents) {
          const currentDegree = inDegree.get(depId) || 0;
          inDegree.set(depId, currentDegree - 1);
          
          if (inDegree.get(depId) === 0) {
            queue.push(depId);
          }
        }
      }
    }

    // 检查是否所有节点都被处理了
    if (result.length !== graph.nodes.size) {
      throw new Error(
        `Topological sort failed: graph may contain cycles or disconnected components`
      );
    }

    return result;
  }

  /**
   * 获取特征的所有依赖（递归）
   * 
   * @param featureId 特征ID
   * @returns 依赖的特征ID列表（包括间接依赖）
   */
  getAllDependencies(featureId: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);

      const definition = this.getFeature(id);
      if (definition && definition.dependsOn) {
        for (const dep of definition.dependsOn) {
          if (dep.type === 'feature') {
            result.push(dep.ref);
            dfs(dep.ref);
          }
        }
      }
    };

    dfs(featureId);
    return result;
  }
}

/**
 * 创建依赖解析器实例
 * 
 * @param getFeature 获取特征定义的函数
 * @returns 依赖解析器实例
 */
export function createDependencyResolver(
  getFeature: (id: string) => FeatureDefinition | undefined
): DependencyResolver {
  return new DependencyResolver(getFeature);
}

