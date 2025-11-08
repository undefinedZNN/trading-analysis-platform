# 回测框架任务追踪系统

本目录包含回测框架开发的完整任务追踪系统。

## 📁 目录结构

```
docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/
├── DASHBOARD.md              # 主仪表盘（总览）
├── README.md                 # 本文件
├── M1-01-DataProvider.md     # M1 任务详细文档
├── M1-02-TimeframeAdapter.md
├── M1-03-FeatureRegistry.md
├── M1-04-EventBus.md
├── M2-01-StrategySandbox.md  # M2 任务详细文档
├── M2-02-RiskEngine.md
├── M2-03-ExecutionEngine.md
├── M2-04-LedgerService.md
├── M3-01-Orchestrator.md     # M3 任务详细文档
├── M3-02-Snapshot.md
├── M3-03-Analytics.md
├── M4-01-TestFramework.md    # M4 任务详细文档
├── M4-02-CI.md
└── scripts/                  # 辅助脚本
    ├── update-progress.sh    # 更新进度
    ├── generate-report.sh    # 生成报告
    └── check-dependencies.sh # 检查依赖
```

## 🚀 快速开始

### 查看总体进度

```bash
# 查看仪表盘
cat docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/DASHBOARD.md

# 或者在浏览器/编辑器中打开
```

### 查看任务详情

每个任务都有独立的 Markdown 文档，包含：
- 任务概述和目标
- 设计要求和接口定义
- 实现要点和示例代码
- 交付物清单
- 测试要求
- 验收标准
- 风险和注意事项

```bash
# 查看某个任务的详细信息
cat docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks/M1-01-DataProvider.md
```

### 使用辅助脚本

#### 1. 更新进度统计

```bash
cd docs/prd/backtesting-strategy-management/backtest-framework-architecture/tasks
chmod +x scripts/*.sh
bash scripts/update-progress.sh
```

#### 2. 生成进度报告

```bash
bash scripts/generate-report.sh
```

生成的报告会保存为 `progress-report-YYYYMMDD.md`

#### 3. 检查依赖关系

```bash
bash scripts/check-dependencies.sh
```

这会检查哪些任务可以开始，哪些任务被依赖阻塞。

## 📊 状态说明

任务状态使用以下标记：

- 🔴 **Pending** - 未开始
- 🟡 **In Progress** - 进行中
- 🟠 **Blocked** - 被依赖阻塞
- 🟢 **Review** - 评审/测试中
- ✅ **Done** - 已完成

## 🔄 更新流程

### 1. 开始任务

当开始一个任务时：
1. 打开对应的任务文档（如 `M1-01-DataProvider.md`）
2. 将状态从 `🔴 Pending` 改为 `🟡 In Progress`
3. 填写负责人
4. 更新 `DASHBOARD.md` 中的对应条目

### 2. 完成任务

当完成一个任务时：
1. 确认所有交付物已完成 ✅
2. 确认所有测试已通过 ✅
3. 将状态改为 `✅ Done`
4. 更新仪表盘
5. 运行 `check-dependencies.sh` 查看哪些任务可以开始

### 3. 生成报告

定期（如每周）生成进度报告：

```bash
bash docs/tasks/scripts/generate-report.sh
```

## 📈 里程碑说明

### M1: 数据/特征与事件总线基线（4个任务）
基础数据层和事件系统，为后续模块提供底层支持。

**关键任务**：
- M1-01: DataProvider
- M1-04: EventBus

### M2: 策略/风控/执行（4个任务）
核心业务逻辑，实现策略运行、风控和撮合。

**关键任务**：
- M2-01: StrategySandbox
- M2-03: ExecutionEngine

### M3: 编排与结果（3个任务）
系统集成和结果输出。

**关键任务**：
- M3-01: Orchestrator
- M3-02: Snapshot/Resume

### M4: 测试套件与CI（2个任务）
质量保障和持续集成。

**关键任务**：
- M4-01: 测试策略框架

## 🔗 相关文档

- [技术架构设计](../backtest-framework-architecture.md)
- [共识纪要](../backtest-framework-consensus.md)
- [任务拆解清单](../backtest-framework-task-breakdown.md)

## ❓ 常见问题

### Q: 如何分配任务？
A: 在对应的任务文档中更新 `**负责人**` 字段。

### Q: 如何跟踪子任务？
A: 每个任务文档中的"交付物清单"使用复选框，可以勾选完成的项目。

### Q: 如何处理任务依赖？
A: 运行 `check-dependencies.sh` 查看依赖状态，等待依赖任务完成后再开始。

### Q: 如何添加新任务？
A: 
1. 创建新的任务文档（参考现有模板）
2. 更新 `DASHBOARD.md`
3. 更新 `check-dependencies.sh` 中的依赖关系

## 📝 更新日志

| 日期 | 变更内容 | 更新人 |
|------|----------|--------|
| 2025-11-07 | 初始化任务追踪系统 | System |

---

💡 **提示**：定期查看仪表盘和生成报告，保持团队同步！

