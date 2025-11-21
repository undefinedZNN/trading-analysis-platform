# Backtrader 迁移项目

**项目状态**: ✅ 需求调研 100% 完成，准备启动 POC  
**最后更新**: 2025-11-21  
**决策状态**: 所有 70 项决策已确认

---

## 📖 文档导航

### 🔥 立即查看

| 文档 | 说明 | 用途 |
|------|------|------|
| **[WORK_LOG.md](./WORK_LOG.md)** | **工作日志和进度记录** | **⭐ 下次工作从这里开始** |
| **[DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md)** 🆕 | **所有 22 个决策的完整汇总** | **查看决策结果** |
| **[BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md)** | 项目状态、70 项决策汇总、时间线 | 了解整体状态 |

### 📋 核心方案

| 文档 | 说明 | 用途 |
|------|------|------|
| [backtrader-final-solution.md](./backtrader-final-solution.md) | 完整技术方案、架构设计 | 了解详细方案 |
| **[POC_KICKOFF.md](./POC_KICKOFF.md)** 🆕 | **POC 启动指南（3周详细计划）** | **🚀 立即开始 POC** |
| [backtrader-poc-plan.md](./backtrader-poc-plan.md) | POC 原始计划（需更新） | 参考文档 |

### ✅ 已确认设计文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [worker-communication-design.md](./worker-communication-design.md) | Worker 与 Backend 通信设计 | ✅ 已确认 |
| [strategy-parameters-design.md](./strategy-parameters-design.md) | 策略自定义参数设计 | ✅ 已确认 |
| [factor-system-design.md](./factor-system-design.md) | 因子系统完整设计 | ✅ 已确认 |
| [visualization-system-design.md](./visualization-system-design.md) | 可视化系统设计 | ✅ 已确认 🆕 |
| [data-caching-design.md](./data-caching-design.md) | 回测数据缓存设计 | ✅ 已确认 🆕 |
| [strategy-version-management-design.md](./strategy-version-management-design.md) | 策略版本管理设计 | ✅ 已确认 🆕 |
| [exception-recovery-design.md](./exception-recovery-design.md) | 异常恢复设计 | ✅ 已确认 🆕 |

### 📚 快速参考

| 文档 | 说明 |
|------|------|
| [strategy-parameters-quick-guide.md](./strategy-parameters-quick-guide.md) | 策略参数快速指南 |
| [parameter-schema-reference.md](./parameter-schema-reference.md) | ParameterSchema 字段参考 |
| [factor-system-quick-guide.md](./factor-system-quick-guide.md) | 因子系统快速指南 |

---

## 🎯 当前阶段

**阶段**: 需求调研 100% 完成 ✅  
**状态**: ⚠️ 需完成前置任务，然后启动 POC  
**时长**: 前置任务 0.5 天 + POC 2-3 周

### ⚠️ 前置任务（必须先完成）

**修改策略版本管理代码**：
- **文件**: `backend/src/backtesting/strategies/strategies.service.ts`
- **方法**: `updateScriptVersion` (line 277-333)
- **变更**: 从 UPDATE 现有版本改为 INSERT 新版本
- **原因**: 每次编辑都会自动产生一个新版本（用户需求）

### POC 目标（已更新）
- ✅ 验证 Backtrader 读取 Parquet 数据
- ✅ **验证内存缓存方案**（LRU，2GB 容量） 🆕
- ✅ **验证断点续跑方案**（每 1000 根 K 线 Checkpoint） 🆕
- ✅ 验证 RabbitMQ 通信流畅
- ✅ 验证性能可接受（≥ 70%，**缓存后提升 20 倍+**） 🆕
- ✅ 验证结果准确（误差 < 1%）
- ✅ 验证因子收集方案
- ✅ **验证 K 线图交易点位标注**（多次加仓/减仓） 🆕

👉 **详细计划**: [backtrader-poc-plan.md](./backtrader-poc-plan.md)（需要更新）

---

## 📊 核心决策（70 项已全部确认）✅

详细决策列表请查看 👉 [DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md)

**战略决策（4 项）**：
- 完全使用 Backtrader
- Python 策略
- 下线自研引擎

**技术决策（5 项）**：
- RabbitMQ + Parquet + Monaco Editor + 微服务

**功能决策（48 项）**：
- Worker 通信、策略参数、因子系统、POC 和监控

**新增决策（22 项）** 🆕：
- 可视化系统、回测数据缓存、策略版本管理、异常恢复

**关键决策亮点**：
- ✅ K 线图支持多次加仓/减仓标注
- ✅ POC 阶段就实现内存缓存（LRU，2GB）
- ✅ 支持断点续跑（每 1000 根 K 线 Checkpoint）
- ✅ 每次编辑策略自动创建新版本

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

### 新加入成员（10 分钟快速了解）
1. 📖 阅读 [BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md) - 了解项目状态
2. 📊 阅读 [DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md) - 了解所有决策
3. 📝 阅读 [WORK_LOG.md](./WORK_LOG.md) - 了解最新进度

### 深入了解（30 分钟）
1. 📚 阅读 [backtrader-final-solution.md](./backtrader-final-solution.md) - 完整技术方案
2. 🔍 阅读感兴趣的专题设计文档

### 准备启动 POC
1. ⚠️ **先完成前置任务**：修改 `strategies.service.ts` 的 `updateScriptVersion` 方法
2. 📋 阅读 [backtrader-poc-plan.md](./backtrader-poc-plan.md)（需要更新以反映新决策）
3. 🛠️ 准备环境：Python 3.11、RabbitMQ、测试数据
4. 🚀 按 POC 计划执行

### 实现参考

| 功能模块 | 参考文档 |
|---------|---------|
| Worker 通信 | [worker-communication-design.md](./worker-communication-design.md) |
| 策略参数 | [strategy-parameters-quick-guide.md](./strategy-parameters-quick-guide.md) |
| 因子系统 | [factor-system-quick-guide.md](./factor-system-quick-guide.md) |
| 可视化 | [visualization-system-design.md](./visualization-system-design.md) |
| 数据缓存 | [data-caching-design.md](./data-caching-design.md) |
| 版本管理 | [strategy-version-management-design.md](./strategy-version-management-design.md) |
| 异常恢复 | [exception-recovery-design.md](./exception-recovery-design.md) |

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
| **需求调研** | 2 周 | ✅ **已完成** |
| **前置任务** | 0.5 天 | ⏳ 待执行 |
| **POC** | 2-3 周 | ⏳ 待启动 |
| **正式开发** | 3-4 个月 | 📅 计划中 |
| **测试验证** | 2-3 周 | 📅 计划中 |
| **上线部署** | 1-2 周 | 📅 计划中 |

**总计**: 4-5 个月

---

## 📈 项目进度

```
需求调研 ━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅
前置任务 ━━━━━━━━━━━━━━━━━━━━━━━━━━   0%  ⏳
POC 验证 ━━━━━━━━━━━━━━━━━━━━━━━━━━   0%  📅
正式开发 ━━━━━━━━━━━━━━━━━━━━━━━━━━   0%  📅
```

**下一个里程碑**: 完成前置任务 + POC 完成  
**预计时间**: 2.5-3.5 周后

---

## 🔗 相关资源

**内部文档**：
- [系统架构设计](../系统架构设计.md)
- [回测模块 PRD](../../prd/backtesting-strategy-management/PRD.md)

**外部资源**：
- [Backtrader 官方文档](https://www.backtrader.com/docu/)
- [Backtrader GitHub](https://github.com/mementum/backtrader)

---

## 📞 联系方式

**项目负责人**: [待填写]  
**技术负责人**: [待填写]  
**POC 执行人**: [待填写]

---

**最后更新**: 2025-11-21  
**文档版本**: 3.0  
**变更说明**: 所有 70 项决策已确认完成
