# 架构设计文档

本目录包含交易分析平台的架构设计文档。

---

## 📁 目录结构

```
architecture/
├── README.md (本文档)
├── 系统架构设计.md (整体系统架构)
├── 技术栈选型.md (技术栈说明)
├── data-import-pipeline.md (数据导入管道)
├── data-import-product-requirements.md (数据导入需求)
│
├── backtrader-migration/ (Backtrader 迁移项目)
│   ├── README.md (项目导航)
│   ├── BACKTRADER_PROJECT_STATUS.md (当前状态)
│   ├── backtrader-poc-plan.md (POC 计划)
│   └── ... (其他 Backtrader 相关文档)
│
└── backtest-service-redesign/ (回测服务重构设计)
    ├── README.md
    ├── 01-architecture-overview.md
    └── ...
```

---

## 📖 文档导航

### 核心架构文档

1. **系统架构设计** → [`系统架构设计.md`](./系统架构设计.md)
   - 整体系统架构
   - 模块划分
   - 技术选型

2. **技术栈选型** → [`技术栈选型.md`](./技术栈选型.md)
   - 前端技术栈
   - 后端技术栈
   - 数据库和存储

### 数据管理

3. **数据导入管道** → [`data-import-pipeline.md`](./data-import-pipeline.md)
4. **数据导入需求** → [`data-import-product-requirements.md`](./data-import-product-requirements.md)

### 专项设计

5. **Backtrader 迁移项目** → [`backtrader-migration/`](./backtrader-migration/)
   - 完整的 Backtrader 替换方案
   - 当前正在进行的项目
   - 📍 **重点关注**

6. **回测服务重构** → [`backtest-service-redesign/`](./backtest-service-redesign/)
   - 回测服务架构重构
   - 服务隔离设计

---

## 🎯 当前重点项目

### Backtrader 迁移项目 (进行中)

**状态**: 需求讨论完成，准备启动 POC  
**时间线**: 1-2 周 POC + 3-4 个月开发

**快速访问**:
- [项目状态](./backtrader-migration/BACKTRADER_PROJECT_STATUS.md) ⭐
- [文档索引](./backtrader-migration/BACKTRADER_RESEARCH_INDEX.md)
- [POC 计划](./backtrader-migration/backtrader-poc-plan.md)

---

## 📝 文档维护

### 添加新文档

1. **通用架构文档** → 直接放在 `architecture/` 目录
2. **专项设计** → 创建子目录，如 `architecture/项目名称/`
3. **临时文档** → 完成后归档或删除

### 文档命名规范

- 中文文档: `系统架构设计.md`
- 英文文档: `data-import-pipeline.md`
- 项目文档: 放在项目子目录

---

## 🔗 相关文档

- [PRD 文档](../prd/) - 产品需求文档
- [QA 文档](../qa/) - 测试和质量保证
- [开发者笔记](../developer-notes/) - 开发技巧和注意事项

---

**维护者**: [待填写]  
**最后更新**: 2025-11-20
