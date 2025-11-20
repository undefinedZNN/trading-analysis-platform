# Backtrader 迁移项目

**项目状态**: ✅ 所有决策已完成，准备启动 POC  
**最后更新**: 2025-11-20

---

## 📖 文档导航

| 文档 | 说明 | 用途 |
|------|------|------|
| **[WORK_LOG.md](./WORK_LOG.md)** | **工作日志和进度记录** | **⭐ 明天从这里开始** |
| **[BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md)** | 项目状态、所有决策汇总、时间线 | 了解整体状态 |
| [backtrader-final-solution.md](./backtrader-final-solution.md) | 完整技术方案、架构设计 | 了解详细方案 |
| [backtrader-poc-plan.md](./backtrader-poc-plan.md) | POC 详细计划、验证步骤 | 🚀 POC 执行指南 |
| | | |
| **核心设计文档** | | |
| [worker-communication-design.md](./worker-communication-design.md) | Worker 与 Backend 通信设计 | 实现通信时参考 |
| [strategy-parameters-design.md](./strategy-parameters-design.md) | 策略自定义参数设计 | 实现参数传递时参考 |
| [factor-system-design.md](./factor-system-design.md) | 因子系统完整设计 | 实现因子系统时参考 |
| | | |
| **待讨论的专题** 🔥 | | |
| **[PENDING_DECISIONS_SUMMARY.md](./PENDING_DECISIONS_SUMMARY.md)** | **待决策问题汇总（21个问题）** | **⭐ 开始决策** |
| [visualization-system-design.md](./visualization-system-design.md) | 可视化系统设计（图表、报告导出） | 🔥 需要决策 |
| [data-caching-design.md](./data-caching-design.md) | 回测数据缓存设计 | 🔥 需要决策 |
| [strategy-version-management-design.md](./strategy-version-management-design.md) | 策略版本管理设计 | 🔥 需要决策 |
| [exception-recovery-design.md](./exception-recovery-design.md) | 异常恢复设计 | 🔥 需要决策 |
| | | |
| **快速参考** | | |
| [strategy-parameters-quick-guide.md](./strategy-parameters-quick-guide.md) | 策略参数快速指南 | 快速了解参数方案 |
| [parameter-schema-reference.md](./parameter-schema-reference.md) | ParameterSchema 字段参考 | 参数配置参考 |
| [factor-system-quick-guide.md](./factor-system-quick-guide.md) | 因子系统快速指南 | 快速了解因子方案 |

---

## 🎯 当前阶段

**阶段**: POC 准备  
**状态**: ✅ 可以立即启动  
**时长**: 1-2 周

### POC 目标
- 验证 Backtrader 读取 Parquet 数据
- 验证 RabbitMQ 通信流畅
- 验证性能可接受（≥ 70%）
- 验证结果准确（误差 < 1%）
- 验证因子收集方案

👉 **详细计划**: [backtrader-poc-plan.md](./backtrader-poc-plan.md)

---

## 📊 核心决策（24 项已全部确认）

详细决策列表请查看 👉 [BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md)

**战略决策**：完全使用 Backtrader，Python 策略，下线自研引擎  
**技术选型**：RabbitMQ + Parquet + Monaco Editor + 微服务  
**超时策略**：空闲 10 分钟 + 系统硬限 48 小时  
**测试要求**：90%+ 覆盖率

---

## 🏗️ 最终架构

```
Frontend (React + Monaco Editor)
    ↓ HTTP REST
NestJS Backend (任务管理、状态跟踪)
    ↓ RabbitMQ (6 个队列)
Python Worker (Backtrader 执行)
    ↓ 读写
共享存储 (Parquet 文件)
```

**详细设计**: [backtrader-final-solution.md](./backtrader-final-solution.md)

---

## 🚀 快速开始

### 新加入成员
1. 阅读 [BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md) (10 分钟)
2. 阅读 [backtrader-final-solution.md](./backtrader-final-solution.md) (30 分钟)

### 启动 POC
1. 阅读 [backtrader-poc-plan.md](./backtrader-poc-plan.md)
2. 准备环境：Python 3.11、RabbitMQ、测试数据
3. 按 POC 计划执行

### 实现通信
参考 [worker-communication-design.md](./worker-communication-design.md)

### 实现策略参数
参考 [strategy-parameters-quick-guide.md](./strategy-parameters-quick-guide.md)

### 实现因子系统
参考 [factor-system-quick-guide.md](./factor-system-quick-guide.md)

---

## ⚠️ 重要提醒

**破坏性变更**：
- TypeScript 策略不再支持
- 现有策略数据已清空
- 用户需用 Python 重写策略

**缓解措施**：
- 提供 Python 策略开发指南（P0 文档）
- 提供 5 个标准策略的 Python 参考实现
- 提供策略模板和技术支持

---

## 📅 时间线

| 阶段 | 时长 | 状态 |
|------|------|------|
| POC | 1-2 周 | ⏳ 待启动 |
| 正式开发 | 3-4 个月 | 📅 计划中 |
| 测试验证 | 2-3 周 | 📅 计划中 |
| 上线部署 | 1-2 周 | 📅 计划中 |

**总计**: 3.5-4.5 个月

---

## 🔗 相关资源

**内部文档**：
- [系统架构设计](../系统架构设计.md)
- [回测模块 PRD](../../prd/backtesting-strategy-management/PRD.md)

**外部资源**：
- [Backtrader 官方文档](https://www.backtrader.com/docu/)
- [Backtrader GitHub](https://github.com/mementum/backtrader)

---

**下一步**: 启动 POC  
**负责人**: [待填写]  
**联系方式**: [待填写]
