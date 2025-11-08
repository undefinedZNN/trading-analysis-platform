# 任务追踪系统迁移说明

## 📋 迁移概述

**迁移日期**: 2025-11-07  
**原路径**: `docs/tasks/`  
**新路径**: `docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/`

## 🔄 迁移原因

为了更好地组织项目文档，将任务追踪系统移动到回测框架架构文档的同级目录下，便于：
- 统一管理回测框架相关的所有文档
- 简化文档间的引用路径
- 提高文档的可发现性

## ✅ 已完成的变更

### 1. 目录移动

```bash
mv docs/tasks/ docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/
```

### 2. 引用路径更新

所有文档中引用 PRD 文档的路径已从：
```markdown
../prd/backtesting-strategy-management/backtest-framework-architecture/xxx.md
```

更新为：
```markdown
../xxx.md
```

#### 更新的文件清单

- ✅ `DASHBOARD.md` - 更新相关文档链接
- ✅ `README.md` - 更新目录结构和使用说明
- ✅ `M1-01-DataProvider.md` - 更新参考文档链接
- ✅ `M1-02-TimeframeAdapter.md` - 更新参考文档链接
- ✅ `M1-03-FeatureRegistry.md` - 更新参考文档链接
- ✅ 其他任务文档（M1-04 至 M4-02）- 验证无需更新

### 3. 脚本验证

所有辅助脚本使用相对路径，无需修改：
- ✅ `scripts/update-progress.sh` - 正常工作
- ✅ `scripts/generate-report.sh` - 正常工作  
- ✅ `scripts/check-dependencies.sh` - 正常工作

## 📍 新的文档结构

```
docs/prd/backtesting-strategy-management/backtest-framework-architecture/
├── backtest-framework-architecture.md    # 技术架构设计
├── backtest-framework-consensus.md       # 共识纪要
├── backtest-framework-task-breakdown.md  # 任务拆解清单
└── tasks/                                # 任务追踪系统 ✨
    ├── DASHBOARD.md
    ├── README.md
    ├── M1-01-DataProvider.md
    ├── M1-02-TimeframeAdapter.md
    ├── M1-03-FeatureRegistry.md
    ├── M1-04-EventBus.md
    ├── M2-01-StrategySandbox.md
    ├── M2-02-RiskEngine.md
    ├── M2-03-ExecutionEngine.md
    ├── M2-04-LedgerService.md
    ├── M3-01-Orchestrator.md
    ├── M3-02-Snapshot.md
    ├── M3-03-Analytics.md
    ├── M4-01-TestFramework.md
    ├── M4-02-CI.md
    └── scripts/
        ├── update-progress.sh
        ├── generate-report.sh
        └── check-dependencies.sh
```

## 🚀 新的使用方式

### 查看仪表盘

```bash
# 新路径
cat docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/DASHBOARD.md

# 或在编辑器中打开
```

### 运行脚本

```bash
# 进入任务目录
cd docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks

# 运行脚本
bash scripts/update-progress.sh
bash scripts/generate-report.sh
bash scripts/check-dependencies.sh
```

### 从项目根目录运行

```bash
# 完整路径方式
bash docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/scripts/update-progress.sh
```

## 🔗 相关文档引用

现在任务文档可以更简洁地引用同级的 PRD 文档：

```markdown
- [技术架构设计](../backtest-framework-architecture.md)
- [共识纪要](../backtest-framework-consensus.md)
- [任务拆解清单](../backtest-framework-task-breakdown.md)
```

## ✅ 验证清单

- [x] 目录移动成功
- [x] DASHBOARD.md 引用更新
- [x] README.md 路径更新
- [x] 任务文档引用更新
- [x] 脚本正常运行
- [x] 文档结构清晰
- [x] 所有链接有效

## 📝 注意事项

1. **书签更新**: 如果您在浏览器或编辑器中保存了旧路径的书签，请更新为新路径
2. **脚本执行**: 建议在 tasks 目录下执行脚本，或使用完整路径
3. **文档编辑**: 编辑任务文档时，引用 PRD 文档使用 `../xxx.md` 格式

## 🎉 迁移完成

任务追踪系统已成功迁移并验证！所有功能正常运行。

---

**更新时间**: 2025-11-07  
**更新人**: System

