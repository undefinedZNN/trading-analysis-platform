# 策略开发文档索引

## 📚 文档导航

### 🚀 快速入门

**新手必读，5分钟上手**

| 文档 | 描述 | 适合人群 |
|------|------|----------|
| [QUICK_START.md](./QUICK_START.md) | 快速入门指南 | ⭐⭐⭐ 新手必读 |
| [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) | 完整开发指南 | ⭐⭐⭐ 所有开发者 |

### 📖 策略参考

**学习和参考现有策略**

| 文档 | 描述 | 适合人群 |
|------|------|----------|
| [README.md](./README.md) | 策略库概览 | ⭐⭐⭐ 了解可用策略 |
| [ma-cross.strategy.ts](./ma-cross.strategy.ts) | 双均线交叉策略 | ⭐⭐ 学习趋势策略 |
| [rsi-mean-reversion.strategy.ts](./rsi-mean-reversion.strategy.ts) | RSI均值回归策略 | ⭐⭐ 学习震荡策略 |
| [bollinger-bands.strategy.ts](./bollinger-bands.strategy.ts) | 布林带策略 | ⭐⭐ 学习多模式策略 |

### ✅ 验证系统

**确保策略结果准确可信**

| 文档 | 描述 | 适合人群 |
|------|------|----------|
| [COMPREHENSIVE_VALIDATION_GUIDE.md](./COMPREHENSIVE_VALIDATION_GUIDE.md) | 完整验证系统指南 | ⭐⭐⭐ 理解验证机制 |
| [VALIDATION_SUMMARY.md](./VALIDATION_SUMMARY.md) | 验证系统总结 | ⭐⭐ 快速了解验证 |
| [TESTING_VERIFICATION.md](./TESTING_VERIFICATION.md) | 测试验证方法 | ⭐ 手工验证 |

### 🛠️ 工具和辅助

**测试和开发工具**

| 文件 | 描述 | 用途 |
|------|------|------|
| [test-strategies.ts](./test-strategies.ts) | 策略测试套件 | 测试所有策略 |
| [comprehensive-validator.ts](./comprehensive-validator.ts) | 完整验证器 | 7层验证引擎 |
| [test-helpers/ohlcv-generator.ts](./test-helpers/ohlcv-generator.ts) | 数据生成器 | 生成测试数据 |

---

## 🎓 学习路径

### 路径 1：新手入门（推荐）

```
1. QUICK_START.md (5分钟)
   ↓
2. 运行测试看示例
   ↓
3. STRATEGY_DEVELOPMENT_GUIDE.md (30分钟)
   ↓
4. 开始开发自己的策略
   ↓
5. COMPREHENSIVE_VALIDATION_GUIDE.md (15分钟)
```

### 路径 2：快速开发

```
1. QUICK_START.md
   ↓
2. 复制模板
   ↓
3. 参考示例策略
   ↓
4. 边开发边查阅 STRATEGY_DEVELOPMENT_GUIDE.md
```

### 路径 3：深入理解

```
1. README.md - 了解系统
   ↓
2. STRATEGY_DEVELOPMENT_GUIDE.md - 完整指南
   ↓
3. COMPREHENSIVE_VALIDATION_GUIDE.md - 验证机制
   ↓
4. 阅读示例策略源码
   ↓
5. 阅读验证器源码
```

---

## 📖 按主题查找

### 开发策略

- **如何开始？** → [QUICK_START.md](./QUICK_START.md)
- **完整API？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - API参考章节
- **参数定义？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 参数定义章节
- **技术指标？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 特征依赖章节
- **状态管理？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 最佳实践章节

### 测试和验证

- **如何测试？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 测试和验证章节
- **验证原理？** → [COMPREHENSIVE_VALIDATION_GUIDE.md](./COMPREHENSIVE_VALIDATION_GUIDE.md)
- **验证失败？** → [COMPREHENSIVE_VALIDATION_GUIDE.md](./COMPREHENSIVE_VALIDATION_GUIDE.md) - 故障排查章节
- **手工验证？** → [TESTING_VERIFICATION.md](./TESTING_VERIFICATION.md)

### 风险控制

- **止损止盈？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 风险控制章节
- **仓位管理？** → [QUICK_START.md](./QUICK_START.md) - 代码片段章节
- **移动止盈？** → 参考 `rsi-mean-reversion.strategy.ts`

### 示例代码

- **简单策略？** → [QUICK_START.md](./QUICK_START.md) - 基础模板
- **完整策略？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 示例代码章节
- **趋势策略？** → [ma-cross.strategy.ts](./ma-cross.strategy.ts)
- **震荡策略？** → [rsi-mean-reversion.strategy.ts](./rsi-mean-reversion.strategy.ts)

### 常见问题

- **获取前一个bar？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 常见问题 Q1
- **复杂条件判断？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 常见问题 Q2
- **自定义指标？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 常见问题 Q3
- **多时间框架？** → [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 常见问题 Q4

---

## 🔍 快速查询

### 我想...

| 需求 | 去哪里看 |
|------|----------|
| **5分钟上手** | [QUICK_START.md](./QUICK_START.md) |
| **复制策略模板** | [QUICK_START.md](./QUICK_START.md) - 基础模板 |
| **了解参数定义** | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 参数定义 |
| **使用技术指标** | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 特征依赖 |
| **发布交易信号** | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - Context API |
| **添加止损** | [QUICK_START.md](./QUICK_START.md) - 止损逻辑 |
| **测试策略** | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 测试和验证 |
| **理解验证系统** | [COMPREHENSIVE_VALIDATION_GUIDE.md](./COMPREHENSIVE_VALIDATION_GUIDE.md) |
| **查看示例** | [README.md](./README.md) + 示例策略源文件 |
| **解决问题** | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) - 常见问题 |

---

## 📝 文档详情

### QUICK_START.md
- **内容**：5分钟快速入门
- **包含**：模板、代码片段、常见错误
- **时长**：5-10分钟
- **优先级**：⭐⭐⭐

### STRATEGY_DEVELOPMENT_GUIDE.md  
- **内容**：完整的策略开发指南
- **包含**：
  - 策略结构
  - 完整API参考
  - 开发流程
  - 测试验证
  - 最佳实践
  - 示例代码
  - 常见问题
- **时长**：30-60分钟
- **优先级**：⭐⭐⭐

### README.md
- **内容**：策略库概览
- **包含**：所有可用策略的说明
- **时长**：10-15分钟
- **优先级**：⭐⭐

### COMPREHENSIVE_VALIDATION_GUIDE.md
- **内容**：7层验证系统详解
- **包含**：
  - 验证架构
  - 7层验证详解
  - 验证结果解读
  - 使用方法
  - 性能考虑
  - 最佳实践
- **时长**：15-30分钟
- **优先级**：⭐⭐⭐

### VALIDATION_SUMMARY.md
- **内容**：验证系统实施总结
- **包含**：功能总结、使用方法、测试结果
- **时长**：10分钟
- **优先级**：⭐⭐

### TESTING_VERIFICATION.md
- **内容**：手工验证方法
- **包含**：验证机制、验证步骤、常见问题
- **时长**：15分钟
- **优先级**：⭐

---

## 🎯 推荐阅读顺序

### 新手（第一次开发策略）

```
Day 1:
  1. QUICK_START.md (5分钟) ✅
  2. 运行测试看效果 (10分钟)
  3. STRATEGY_DEVELOPMENT_GUIDE.md - 快速开始章节 (10分钟)

Day 2:
  4. STRATEGY_DEVELOPMENT_GUIDE.md - API参考章节 (20分钟)
  5. 参考示例策略 (15分钟)
  6. 开始开发自己的策略 (1小时+)

Day 3:
  7. STRATEGY_DEVELOPMENT_GUIDE.md - 最佳实践 (15分钟)
  8. 测试和优化策略 (1小时+)
  9. COMPREHENSIVE_VALIDATION_GUIDE.md (可选，15分钟)
```

### 有经验的开发者

```
1. QUICK_START.md - 快速浏览模板 (3分钟)
2. STRATEGY_DEVELOPMENT_GUIDE.md - API参考 (10分钟)
3. 开始开发 (参考文档即可)
4. 遇到问题时查阅相关章节
```

### 架构师/系统设计者

```
1. README.md - 系统概览 (10分钟)
2. COMPREHENSIVE_VALIDATION_GUIDE.md - 验证架构 (20分钟)
3. 查看验证器源码 (30分钟)
4. STRATEGY_DEVELOPMENT_GUIDE.md - 完整阅读 (30分钟)
```

---

## 💬 获取帮助

### 在文档中查找

1. **使用文档搜索**：在你的编辑器中搜索关键词
2. **查看索引**：本文档的"按主题查找"部分
3. **常见问题**：STRATEGY_DEVELOPMENT_GUIDE.md - 常见问题章节

### 示例代码

| 需求 | 示例位置 |
|------|----------|
| 简单策略 | [QUICK_START.md](./QUICK_START.md) |
| 完整策略 | [STRATEGY_DEVELOPMENT_GUIDE.md](./STRATEGY_DEVELOPMENT_GUIDE.md) |
| 趋势策略 | [ma-cross.strategy.ts](./ma-cross.strategy.ts) |
| 震荡策略 | [rsi-mean-reversion.strategy.ts](./rsi-mean-reversion.strategy.ts) |
| 多模式策略 | [bollinger-bands.strategy.ts](./bollinger-bands.strategy.ts) |

---

## 🔄 文档更新

| 文档 | 最后更新 | 版本 |
|------|----------|------|
| QUICK_START.md | 2024 | v1.0 |
| STRATEGY_DEVELOPMENT_GUIDE.md | 2024 | v1.0 |
| COMPREHENSIVE_VALIDATION_GUIDE.md | 2024 | v1.0 |
| VALIDATION_SUMMARY.md | 2024 | v1.0 |
| README.md | 2024 | v1.0 |

---

## 📊 文档统计

- **总文档数**：8个
- **代码示例**：15+
- **示例策略**：3个
- **覆盖主题**：策略开发、测试、验证、最佳实践
- **预计阅读时长**：2-4小时（完整阅读）

---

**选择你需要的文档，开始策略开发之旅！** 🚀

