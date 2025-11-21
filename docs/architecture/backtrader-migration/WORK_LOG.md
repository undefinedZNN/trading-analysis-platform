# Backtrader 迁移项目工作日志

---

## 📅 2025-11-21 工作记录 🎉

### ✅ 重大里程碑：所有决策问题已确认完毕！

#### 决策确认会议

**参与人员**: 产品负责人  
**耗时**: 约 1 小时  
**确认问题数**: 22 个

---

#### 决策结果汇总

**第一部分：可视化系统（5个问题）**
1. ✅ K 线图：B+（增强简化版） - K线+成交量+多次加仓/减仓标注，不需技术指标
2. ✅ 报告导出：不需要导出 - 只在前端查看，支持因子过滤
3. ✅ 自定义模板：不需要
4. ✅ 实时更新：不需要
5. ✅ 数据量处理：混合（统计用聚合，详情用分页）

**第二部分：回测数据缓存（5个问题）**
6. ✅ 是否缓存：POC 阶段就加缓存
7. ✅ 缓存容量：默认 2GB，可配置
8. ✅ 缓存预热：不需要
9. ✅ 失效策略：LRU + Worker 重启时清空
10. ✅ Redis 缓存：不需要（先用内存缓存）

**第三部分：策略版本管理（6个问题）**
11. ✅ 版本编辑行为：每次编辑创建新版本 ⚠️ 需要修改现有代码
12. ✅ 版本说明：必填
13. ✅ 版本回滚：切换 master
14. ✅ 版本删除：不允许删除
15. ✅ 版本标签：现有实现已覆盖
16. ✅ 版本命名：现有实现已覆盖

**第四部分：异常恢复（6个问题）**
17. ✅ 自动重试：不自动重试
18. ✅ 断点续跑：需要
19. ✅ Checkpoint 频率：按K线数（每1000根）
20. ✅ 失败数据处理：保留部分结果
21. ✅ 告警通知：站内消息
22. ✅ Worker 健康检查：只检查心跳

---

#### 重要产品需求澄清

**可视化系统**：
- 需要支持多次加仓/减仓的清晰标注
- 用户通过因子过滤器可以生成多份不同视图的报告
- 不需要导出功能，只在前端查看

**版本管理**：
- ⚠️ **关键变更**：每次编辑都会自动产生一个新版本
- 一个策略拥有多个版本同时存在
- 其中一个可以设置为 master 版本
- 前端实现自动保存草稿，服务端不需要缓存

**异常恢复**：
- 需要断点续跑功能（每 1000 根 K 线保存 Checkpoint）
- 失败后保留部分结果，便于排查问题

---

#### 完成的文档更新

1. ✅ 创建 `DECISIONS_CONFIRMED.md` - 22 个决策的完整汇总
2. ✅ 更新 `visualization-system-design.md` - 标记所有问题为已确认
3. ✅ 更新 `data-caching-design.md` - 标记所有问题为已确认
4. ✅ 更新 `strategy-version-management-design.md` - 标记所有问题为已确认
5. ✅ 更新 `exception-recovery-design.md` - 标记所有问题为已确认
6. ✅ 更新 `WORK_LOG.md` - 本日志

---

#### ⚠️ 需要修改的现有代码

**策略版本管理 - updateScriptVersion 方法**：
- **当前行为**：直接 UPDATE 现有版本
- **新需求行为**：每次编辑 INSERT 新版本
- **影响范围**：`backend/src/backtesting/strategies/strategies.service.ts`
- **优先级**：高 - 在 POC 前修改

---

## 📅 2025-11-20 工作记录

### ✅ 已完成的工作

#### 1. 核心设计完成 ✅

- ✅ **Worker 通信设计**（已确认）
  - 6 个 RabbitMQ 队列
  - 状态同步策略
  - 进度更新频率（每 1% 或 1 分钟，最小间隔 10 秒）
  - 任务超时策略（混合：空闲 10 分钟 + 硬限 48 小时）
  
- ✅ **策略参数设计**（已确认）
  - 前端动态配置 + Worker 验证
  - 扩展 `parameterSchema`（required + componentType）
  - 支持 9 种表单组件类型
  
- ✅ **因子系统设计**（已确认）
  - 分阶段固化（入场/持仓期间/出场）
  - 内置因子可扩展架构
  - 自定义因子动态更新
  - 前端根据 `filterConfig` 动态渲染

#### 2. 新增 4 个讨论专题文档 🔥

创建了详细的设计文档，每个都包含多个方案对比：

- 📊 **可视化系统设计** (5 个待决策问题)
  - 方案对比：Backtrader 内置 vs 纯前端 ECharts vs 混合
  - K 线图需求分析
  - 报告导出设计（HTML/PDF/Excel）
  - 数据导出格式设计
  
- 💾 **回测数据缓存设计** (5 个待决策问题)
  - 5 种缓存方案对比（无缓存 → Redis → 混合缓存）
  - LRU 缓存实现
  - 性能提升估算（27 倍）
  - 缓存监控指标
  
- 📦 **策略版本管理设计** (6 个待决策问题)
  - 3 种方案对比（简单列表 → Git 风格 → 集成 Git）
  - 版本历史、回滚、对比功能
  - 版本标签设计
  - 前端 UI 设计
  
- 🔧 **异常恢复设计** (6 个待决策问题)
  - 3 种方案对比（基础版 → 自动重试 → 断点续跑）
  - Worker 崩溃检测
  - 任务超时检测
  - 告警通知设计

#### 3. 文档整理完成 ✅

- ✅ 删除了 `strategy-parameters-implementation.md`（实现文档，不应在需求阶段存在）
- ✅ 创建了 `PENDING_DECISIONS_SUMMARY.md`（汇总 21 个待决策问题）
- ✅ 更新了 `README.md` 和 `BACKTRADER_PROJECT_STATUS.md`
- ✅ 文档按类别组织：核心方案、已确认设计、待讨论专题、快速参考

---

## 🔥 当前状态

### 已确认的决策（70 项）✅

- ✅ 战略决策（4 项）：全面使用 Backtrader、下线自研引擎、Python 策略
- ✅ 技术决策（5 项）：RabbitMQ、Parquet、Monaco Editor、微服务
- ✅ Worker 通信（7 项）：6 个队列、进度更新、超时策略等
- ✅ 策略参数（5 项）：前端配置、Worker 验证、表单渲染
- ✅ 因子系统（10 项）：分阶段固化、可扩展架构、动态渲染
- ✅ POC 和监控（17 项）：POC 数据、监控方案、测试覆盖率等
- ✅ **可视化系统（5 项）**：K线图、报告导出、数据量处理等 🆕
- ✅ **回测数据缓存（5 项）**：内存缓存、LRU 淘汰、容量限制等 🆕
- ✅ **策略版本管理（6 项）**：版本编辑、回滚、删除策略等 🆕
- ✅ **异常恢复（6 项）**：断点续跑、Checkpoint、告警通知等 🆕

### 待决策的问题（0 项）✅

**🎉 所有决策问题已确认完毕！**

**详细清单**：[DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md)

---

## 📋 下一步工作计划

### ✅ 决策阶段已完成

所有 22 个决策问题已确认，可以直接进入开发阶段！

---

### 🚀 立即可执行的任务

#### 1. 修改现有代码（高优先级）⚠️

**策略版本管理 - updateScriptVersion 方法**

**文件**: `backend/src/backtesting/strategies/strategies.service.ts`

**需要修改的行为**：
- **当前**：直接 UPDATE 现有版本（line 277-333）
- **新需求**：每次编辑 INSERT 新版本，保留历史

**修改方案**：
```typescript
async updateScriptVersion(strategyId, scriptVersionId, dto) {
  // 不再更新现有版本，而是基于旧版本创建新版本
  const oldVersion = await this.scriptVersionRepository.findOne({
    where: { scriptVersionId, strategyId }
  });
  
  if (!oldVersion) {
    throw new NotFoundException('脚本版本不存在');
  }
  
  // 获取现有版本列表，生成新版本名
  const existingVersions = await this.scriptVersionRepository.find({
    where: { strategyId },
    select: { versionName: true }
  });
  
  const newVersionName = generateVersionName(
    existingVersions.map(v => v.versionName)
  );
  
  // 创建新版本（基于旧版本）
  const newVersion = await this.createVersionInternal(strategyId, {
    code: dto.code ?? oldVersion.code,
    remark: dto.remark, // 必填
    versionName: newVersionName,
    createdBy: dto.updatedBy,
    updatedBy: dto.updatedBy
  }, false);
  
  // 如果需要设为 master
  if (dto.setMaster) {
    await this.setMasterVersion(strategyId, newVersion.scriptVersionId);
  }
  
  return this.getStrategy(strategyId);
}
```

**前端配套修改**：
- 编辑策略时，强制要求填写 `remark`（版本说明）

---

#### 2. 启动 POC 开发

**前置条件**：✅ 所有已满足

**POC 范围**（根据决策结果更新）：

**核心功能**：
- ✅ Backtrader 引擎集成
- ✅ Parquet 数据读取
- ✅ **内存缓存实现**（LRU，2GB 容量）
- ✅ **断点续跑**（每 1000 根 K 线 Checkpoint）
- ✅ RabbitMQ 任务队列
- ✅ 进度上报

**可视化**：
- ✅ 权益曲线
- ✅ **K 线图 + 成交量 + 交易点位标注**（支持多次加仓/减仓）
- ✅ 交易列表（基础表格）
- ✅ 统计卡片

**测试场景**：
- ✅ 单次回测（ES 1 分钟数据，1 年）
- ✅ **参数优化**（50 组参数，验证缓存效果）
- ✅ **Worker 崩溃恢复**（验证断点续跑）

**预计耗时**：2-3 周（新增了缓存和断点续跑功能）

**参考文档**：[backtrader-poc-plan.md](./backtrader-poc-plan.md)（需要更新）

---

## 📊 项目整体进度

```
需求调研阶段 ━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% 完成 ✅

已完成：
  ✅ 核心技术方案设计
  ✅ Worker 通信设计
  ✅ 策略参数设计
  ✅ 因子系统设计
  ✅ 4 个专题调研（可视化、缓存、版本管理、异常恢复）
  ✅ 22 个决策问题全部确认
  
当前阶段：
  🚀 POC 开发阶段（预计 2-3 周）
  
前置任务：
  ⚠️ 修改策略版本管理代码（updateScriptVersion）
```

---

## 📚 关键文档快速链接

### 立即查看

- 🔥 **[PENDING_DECISIONS_SUMMARY.md](./PENDING_DECISIONS_SUMMARY.md)** - 待决策问题汇总（从这里开始）
- 📖 **[README.md](./README.md)** - 文档导航
- 📊 **[BACKTRADER_PROJECT_STATUS.md](./BACKTRADER_PROJECT_STATUS.md)** - 项目状态总览

### 专题设计文档

- 📊 [可视化系统设计](./visualization-system-design.md)
- 💾 [回测数据缓存设计](./data-caching-design.md)
- 📦 [策略版本管理设计](./strategy-version-management-design.md)
- 🔧 [异常恢复设计](./exception-recovery-design.md)

### 已确认设计

- 🔌 [Worker 通信设计](./worker-communication-design.md)
- ⚙️ [策略参数设计](./strategy-parameters-design.md)
- 📊 [因子系统设计](./factor-system-design.md)

---

## 💡 保守方案速查（如果需要快速决策）

### 可视化系统
- K 线图：**简化版**（标注交易点位）
- 报告导出：**HTML + Excel**
- 自定义模板：**不需要**
- 实时更新：**不需要**

### 回测数据缓存
- POC 阶段：**不缓存**
- 正式开发：**内存缓存（2GB + LRU）**
- Redis：**暂不需要**

### 策略版本管理
- 版本说明：**必填**
- 回滚方式：**创建新版本**
- 版本标签：**MVP 不做**
- 版本删除：**不允许**

### 异常恢复
- 自动重试：**不自动重试**
- 断点续跑：**不需要**
- 健康检查：**只检查心跳**
- 告警方式：**站内消息 + 邮件**

---

## 📝 备注

- 所有设计文档均已完成，内容详尽
- 待决策问题均有推荐方案，可快速决策
- 文档结构清晰，便于查阅和维护
- 可根据实际情况灵活调整方案

---

**下次工作从这里开始**：
1. 👉 修改 `strategies.service.ts` 的 `updateScriptVersion` 方法
2. 👉 查看 [DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md) 了解所有决策
3. 👉 启动 POC 开发

**项目状态**：✅ 需求调研阶段 100% 完成，准备启动 POC

**最后更新**：2025-11-21 15:30

---

## 🎯 快速恢复工作的步骤

下次开始时：

1. **打开这个文档** - 快速回顾进度
2. **查看决策结果** - [DECISIONS_CONFIRMED.md](./DECISIONS_CONFIRMED.md)
3. **修改现有代码** - 策略版本管理的 updateScriptVersion 方法
4. **启动 POC 开发** - 按照新的决策实施（包含缓存和断点续跑）

🎉 所有决策已完成，可以全力开发了！

