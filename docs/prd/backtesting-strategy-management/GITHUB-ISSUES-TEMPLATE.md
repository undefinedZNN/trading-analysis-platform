# GitHub Issues 任务模板

> 本文档提供Phase 1所有任务的GitHub Issues格式，可直接复制到GitHub创建Issue

---

## 📋 使用说明

1. 在GitHub仓库中进入Issues页面
2. 点击"New Issue"
3. 复制下面对应任务的内容
4. 填写标题和描述
5. 添加标签（labels）
6. 指定负责人（assignees）
7. 添加到Project（如果有）

---

## Sprint 1.1: 脚本校验增强

### Issue #1: TypeScript类型检查服务

**标题**: `[BE] 实现TypeScript类型检查服务`

**标签**: `backend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
实现TypeScript类型检查服务，用于验证策略脚本的类型正确性。

## 🎯 目标
- 集成`tsc --noEmit`命令
- 在沙箱环境中执行
- 返回结构化错误信息

## ✅ 验收标准
- [ ] 能够检测TypeScript类型错误
- [ ] 返回结构化错误信息（文件、行号、列号、消息）
- [ ] 执行超时控制（< 3秒）
- [ ] 资源限制（内存、CPU）
- [ ] 单元测试覆盖率 ≥ 80%

## 📝 API接口
```typescript
POST /api/backtesting/strategies/:id/script-versions/validate
Request: {
  code: string;
  dependencies?: string[];
}
Response: {
  valid: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  executionTime: number;
}
\```

## 📁 相关文件
- `backend/src/backtesting/strategy/validators/typescript-validator.service.ts`
- `backend/src/backtesting/strategy/validators/typescript-validator.spec.ts`

## ⏱️ 预计工时
1天

## 🔗 相关Issue
- 依赖: 无
- 阻塞: #2 (FE-101)

## 📚 参考资料
- [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
```

---

### Issue #2: ESLint校验服务

**标题**: `[BE] 实现ESLint校验服务`

**标签**: `backend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
实现ESLint校验服务，检查代码规范和潜在问题。

## 🎯 目标
- 集成ESLint引擎
- 配置规则集
- 支持自定义规则
- 错误分级

## ✅ 验收标准
- [ ] 能够检测代码规范问题
- [ ] 支持可配置的规则集
- [ ] 返回结构化错误信息
- [ ] 执行超时控制
- [ ] 单元测试覆盖率 ≥ 80%

## 📁 相关文件
- `backend/src/backtesting/strategy/validators/eslint-validator.service.ts`
- `backend/src/backtesting/strategy/validators/eslint-validator.spec.ts`
- `backend/src/backtesting/strategy/validators/eslint.config.json`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: 无
- 阻塞: #2 (FE-101)
```

---

### Issue #3: Schema解析与校验

**标题**: `[BE] 实现Schema解析与校验`

**标签**: `backend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
实现参数Schema和因子Schema的解析与校验逻辑。

## 🎯 目标
- 在沙箱中执行策略脚本
- 解析导出的parameters和factors
- 校验Schema字段完整性
- 检查字段唯一性和类型

## ✅ 验收标准
- [ ] 能够解析策略导出的Schema
- [ ] 校验必填字段（key, label, type）
- [ ] 检查字段唯一性
- [ ] 验证type与component的匹配
- [ ] 单元测试覆盖率 ≥ 80%

## 📁 相关文件
- `backend/src/backtesting/strategy/validators/schema-validator.service.ts`
- `backend/src/backtesting/strategy/validators/schema-validator.spec.ts`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: 无
```

---

### Issue #4: 校验结果展示组件

**标题**: `[FE] 实现校验结果展示组件`

**标签**: `frontend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
创建校验结果展示组件，清晰地展示TypeScript和ESLint的校验错误。

## 🎯 目标
- 错误列表面板（可折叠）
- 错误分类（TypeScript/ESLint）
- 错误分级（error/warning/info）
- 点击跳转到错误行

## ✅ 验收标准
- [ ] 清晰展示所有错误
- [ ] 支持按类型和级别筛选
- [ ] 点击错误可跳转到代码行
- [ ] 显示错误统计（总数、error数、warning数）
- [ ] 组件单元测试

## 📁 相关文件
- `frontend/src/modules/backtesting/components/ValidationPanel.tsx`
- `frontend/src/modules/backtesting/components/ValidationPanel.spec.tsx`
- `frontend/src/modules/backtesting/components/ValidationPanel.less`

## ⏱️ 预计工时
1天

## 🔗 相关Issue
- 依赖: #1 (BE-101), #2 (BE-102)
- 阻塞: #6 (FE-103)
```

---

### Issue #5: Monaco编辑器错误标记

**标题**: `[FE] Monaco编辑器错误标记集成`

**标签**: `frontend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
在Monaco编辑器中集成错误标记功能，实时显示校验错误。

## 🎯 目标
- Monaco Editor Markers API集成
- 错误下划线高亮
- Hover提示详情
- 实时校验（防抖）

## ✅ 验收标准
- [ ] 错误行有红色波浪线标记
- [ ] 警告行有黄色波浪线标记
- [ ] Hover显示错误详情
- [ ] 支持实时校验（保存时触发）
- [ ] 性能优化（大文件不卡顿）

## 📁 相关文件
- `frontend/src/modules/backtesting/components/ScriptEditor.tsx`
- `frontend/src/modules/backtesting/hooks/useScriptValidation.ts`

## ⏱️ 预计工时
1天

## 🔗 相关Issue
- 依赖: #1 (BE-101), #2 (BE-102)
- 阻塞: #6 (FE-103)
```

---

### Issue #6: 校验触发与流程

**标题**: `[FE] 实现校验触发逻辑和流程`

**标签**: `frontend`, `P0`, `Sprint-1.1`

**描述**:
```markdown
## 📋 任务描述
实现校验触发逻辑和完整的校验流程。

## 🎯 目标
- 保存时自动触发校验
- 手动触发校验按钮
- 校验中的Loading状态
- 校验失败阻止保存

## ✅ 验收标准
- [ ] 保存时自动校验
- [ ] 校验中显示Loading
- [ ] 校验失败阻止保存并提示
- [ ] 校验成功允许保存
- [ ] 用户体验流畅

## 📁 相关文件
- `frontend/src/modules/backtesting/pages/StrategyDetail.tsx`
- `frontend/src/modules/backtesting/hooks/useStrategyValidation.ts`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #4 (FE-101), #5 (FE-102)
- 阻塞: #13 (QA-101)
```

---

## Sprint 1.2: 版本对比功能

### Issue #7: 版本对比API

**标题**: `[BE] 实现版本对比API`

**标签**: `backend`, `P0`, `Sprint-1.2`

**描述**:
```markdown
## 📋 任务描述
实现版本对比API，返回两个版本之间的代码和Schema差异。

## 🎯 目标
- 使用diff算法（如jsdiff库）
- 代码分段diff
- Schema字段级对比
- 差异统计

## ✅ 验收标准
- [ ] 返回代码diff（行级差异）
- [ ] 返回Schema diff（字段级差异）
- [ ] 支持多种diff格式（unified/split）
- [ ] 性能优化（大文件对比 < 1秒）
- [ ] 单元测试覆盖率 ≥ 80%

## 📁 相关文件
- `backend/src/backtesting/strategy/services/version-diff.service.ts`
- `backend/src/backtesting/strategy/services/version-diff.spec.ts`

## ⏱️ 预计工时
1天

## 🔗 相关Issue
- 依赖: 无
- 阻塞: #8 (BE-105), #9 (FE-104), #10 (FE-105)
```

---

### Issue #8: 对比结果缓存

**标题**: `[BE] 实现对比结果缓存`

**标签**: `backend`, `P1`, `Sprint-1.2`

**描述**:
```markdown
## 📋 任务描述
实现对比结果的缓存机制，提升重复对比的性能。

## 🎯 目标
- Redis缓存
- 缓存键设计
- TTL设置（1小时）
- 缓存失效策略

## ✅ 验收标准
- [ ] 热点对比从缓存返回
- [ ] 缓存命中率监控
- [ ] 版本更新时自动失效
- [ ] 性能提升明显（< 100ms）

## 📁 相关文件
- `backend/src/backtesting/strategy/services/version-diff-cache.service.ts`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #7 (BE-104)
```

---

### Issue #9: 代码diff视图

**标题**: `[FE] 实现代码diff视图`

**标签**: `frontend`, `P0`, `Sprint-1.2`

**描述**:
```markdown
## 📋 任务描述
实现代码diff视图，清晰展示两个版本的代码差异。

## 🎯 目标
- 使用Monaco Diff Editor
- 左右分栏对比
- 行级差异高亮
- 支持折叠/展开

## ✅ 验收标准
- [ ] 清晰展示代码差异
- [ ] 新增行绿色高亮
- [ ] 删除行红色高亮
- [ ] 修改行黄色高亮
- [ ] 支持滚动联动
- [ ] 性能流畅（大文件不卡顿）

## 📁 相关文件
- `frontend/src/modules/backtesting/components/CodeDiffViewer.tsx`
- `frontend/src/modules/backtesting/components/CodeDiffViewer.less`

## ⏱️ 预计工时
1.5天

## 🔗 相关Issue
- 依赖: #7 (BE-104)
- 阻塞: #11 (FE-106)
```

---

### Issue #10: Schema对比视图

**标题**: `[FE] 实现Schema对比视图`

**标签**: `frontend`, `P0`, `Sprint-1.2`

**描述**:
```markdown
## 📋 任务描述
实现Schema对比视图，展示参数和因子的字段差异。

## 🎯 目标
- 表格展示
- 字段级对比
- 差异标记
- 差异统计

## ✅ 验收标准
- [ ] 清晰展示Schema差异
- [ ] 新增字段绿色标记
- [ ] 删除字段红色标记
- [ ] 修改字段黄色标记
- [ ] 显示差异统计

## 📁 相关文件
- `frontend/src/modules/backtesting/components/SchemaDiffViewer.tsx`
- `frontend/src/modules/backtesting/components/SchemaDiffViewer.less`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #7 (BE-104)
- 阻塞: #11 (FE-106)
```

---

### Issue #11: 版本对比流程

**标题**: `[FE] 实现版本对比完整流程`

**标签**: `frontend`, `P0`, `Sprint-1.2`

**描述**:
```markdown
## 📋 任务描述
实现完整的版本对比流程，包括版本选择、对比展示、模式切换。

## 🎯 目标
- 版本选择器
- 对比模式切换
- 对比弹窗/页面
- 防止自比自身

## ✅ 验收标准
- [ ] 可选择任意两个版本对比
- [ ] 支持切换对比模式
- [ ] 防止选择相同版本
- [ ] 用户体验流畅

## 📁 相关文件
- `frontend/src/modules/backtesting/components/VersionCompareModal.tsx`
- `frontend/src/modules/backtesting/pages/VersionCompare.tsx`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #9 (FE-104), #10 (FE-105)
- 阻塞: #13 (QA-101)
```

---

## Sprint 1.3: 审计与文档

### Issue #12: 回测任务引用信息

**标题**: `[BE] 实现回测任务引用信息查询`

**标签**: `backend`, `P1`, `Sprint-1.3`

**描述**:
```markdown
## 📋 任务描述
在策略详情中显示回测任务引用信息。

## 🎯 目标
- 查询关联的回测任务
- 显示最近5个任务
- 任务状态与结果快照

## ✅ 验收标准
- [ ] 返回最近5个引用任务
- [ ] 包含任务ID、状态、创建时间
- [ ] 包含收益率快照（如已完成）
- [ ] 查询性能优化

## 📁 相关文件
- `backend/src/backtesting/strategy/controllers/strategy.controller.ts`
- `backend/src/backtesting/strategy/services/strategy.service.ts`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: 无
- 阻塞: #14 (FE-107)
```

---

### Issue #13: E2E测试编写

**标题**: `[QA] Phase 1 E2E测试编写`

**标签**: `qa`, `P1`, `Sprint-1.3`, `testing`

**描述**:
```markdown
## 📋 任务描述
编写Phase 1功能的E2E测试用例。

## 🎯 测试场景
1. 策略创建流程
2. 脚本编辑与保存
3. 脚本校验（成功/失败）
4. 版本创建与管理
5. 版本对比
6. 设为master

## ✅ 验收标准
- [ ] 覆盖所有核心流程
- [ ] 测试用例清晰
- [ ] 测试通过率100%
- [ ] 测试报告完整

## 📁 相关文件
- `frontend/e2e/strategy-management.spec.ts`
- `frontend/e2e/script-validation.spec.ts`
- `frontend/e2e/version-compare.spec.ts`

## ⏱️ 预计工时
1天

## 🔗 相关Issue
- 依赖: #6 (FE-103), #11 (FE-106), #14 (FE-107)
```

---

### Issue #14: 版本使用统计展示

**标题**: `[FE] 实现版本使用统计展示`

**标签**: `frontend`, `P1`, `Sprint-1.3`

**描述**:
```markdown
## 📋 任务描述
在版本列表中展示使用统计信息。

## 🎯 目标
- 使用次数
- 最后使用时间
- 引用任务列表

## ✅ 验收标准
- [ ] 显示使用次数
- [ ] 显示最后使用时间
- [ ] 点击查看引用任务列表
- [ ] 样式美观

## 📁 相关文件
- `frontend/src/modules/backtesting/components/VersionList.tsx`
- `frontend/src/modules/backtesting/components/VersionUsageStats.tsx`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #12 (BE-106)
- 阻塞: #13 (QA-101)
```

---

### Issue #15: API文档更新

**标题**: `[DOC] 更新API文档`

**标签**: `documentation`, `P1`, `Sprint-1.3`

**描述**:
```markdown
## 📋 任务描述
更新Swagger API文档，包含所有新增接口。

## 🎯 目标
- 文档化所有新增API
- 提供请求/响应示例
- 错误码说明完整
- Swagger可正常访问

## ✅ 验收标准
- [ ] 所有新增API已文档化
- [ ] 包含请求/响应示例
- [ ] 错误码说明完整
- [ ] Swagger可正常访问

## 📁 相关文件
- `backend/src/backtesting/strategy/controllers/*.controller.ts`

## ⏱️ 预计工时
0.5天

## 🔗 相关Issue
- 依赖: #1, #2, #3, #7, #12
```

---

## 📊 任务统计

| Sprint | 任务数 | 后端 | 前端 | QA | 文档 |
|--------|--------|------|------|----|----|
| Sprint 1.1 | 6 | 3 | 3 | 0 | 0 |
| Sprint 1.2 | 5 | 2 | 3 | 0 | 0 |
| Sprint 1.3 | 4 | 1 | 1 | 1 | 1 |
| **总计** | **15** | **6** | **7** | **1** | **1** |

---

## 🏷️ 标签说明

- `backend`: 后端任务
- `frontend`: 前端任务
- `qa`: 测试任务
- `documentation`: 文档任务
- `P0`: 最高优先级
- `P1`: 高优先级
- `P2`: 中优先级
- `Sprint-1.1`: 第一个Sprint
- `Sprint-1.2`: 第二个Sprint
- `Sprint-1.3`: 第三个Sprint
- `bug`: Bug修复
- `enhancement`: 功能增强
- `testing`: 测试相关

---

**文档维护**: PM Team  
**最后更新**: 2024-11-09  
**版本**: v1.0

