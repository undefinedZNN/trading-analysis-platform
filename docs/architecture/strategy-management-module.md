# 回测策略管理模块设计（更新版）

## 1. 模块目标
- 用最小流程管理回测策略的基础信息和脚本版本。
- 提供在线 TypeScript 编辑体验，研发可直接在平台编写/保存脚本。
- 保留脚本版本演进历史，可标记主版本以供回测任务引用。

## 2. 数据模型

### 2.1 `StrategyEntity`（表：`strategies`）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `strategy_id` | `serial` | 主键 |
| `code` | `text` | 策略唯一编码（CLI/接口调用使用），唯一索引 |
| `name` | `text` | 策略名称 |
| `team` | `text` | 归属团队/小组 |
| `markets` | `text[]` | 适用市场/标的集合 |
| `frequency` | `text` | 交易频率（如 `1m`、`1d`） |
| `tags` | `text[]` | 标签集合 |
| `description` | `text` | 描述/备注 |
| `deleted_at` | `timestamptz` | 软删除时间（可选） |
| 审计字段 | 继承 `BaseAuditEntity` |

### 2.2 `StrategyScriptVersionEntity`（表：`strategy_scripts`）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `script_id` | `serial` | 主键 |
| `strategy_id` | `int` | 外键 → `strategies` |
| `version_code` | `text` | 脚本版本号（可选自动生成 format: `vYYYYMMDD-HHMMSS`） |
| `description` | `text` | 版本描述 |
| `changelog` | `text` | 变更记录（Markdown/文本） |
| `script_source` | `text` | TypeScript 源码文本 |
| `manifest` | `jsonb` | 脚本 manifest（入口文件、依赖等） |
| `is_primary` | `boolean` | 是否主版本 |
| 审计字段 | 继承 `BaseAuditEntity` |

> 自定义参数与因子由脚本内部调用 SDK 注册，无需额外表单或 Schema 持久化。

## 3. API 设计

| 功能 | Method / Path | 说明 |
| --- | --- | --- |
| 策略列表 | `GET /strategy-management/strategies` | 关键字、标签、市场筛选，分页返回 |
| 创建策略 | `POST /strategy-management/strategies` | 写入基础信息 |
| 策略详情 | `GET /strategy-management/strategies/:strategyId` | 返回策略元数据及脚本摘要 |
| 更新策略 | `PATCH /strategy-management/strategies/:strategyId` | 更新名称、标签等 |
| 删除策略 | `DELETE /strategy-management/strategies/:strategyId` | 软删除 |
| 脚本列表 | `GET /strategy-management/strategies/:strategyId/scripts` | 返回脚本版本集合（含主版本标记） |
| 新建脚本版本 | `POST /strategy-management/strategies/:strategyId/scripts` | 提交脚本文本及元数据，版本号可空（后端自动生成） |
| 获取脚本详情 | `GET /strategy-management/scripts/:scriptId` | 返回脚本源码、manifest 等信息 |
| 更新脚本版本 | `PATCH /strategy-management/scripts/:scriptId` | 修改脚本文本、描述、主版本标记 |

返回结构统一 `{ items, total, page, pageSize }`；单体接口返回实体 JSON。

## 4. 模块结构

```
backend/src/strategy-management/
├── controllers/
│   ├── strategies.controller.ts
│   └── strategy-scripts.controller.ts
├── dto/
│   ├── strategy.dto.ts            # 策略基础信息 DTO
│   └── strategy-script.dto.ts     # 脚本版本 DTO
├── entities/
│   ├── strategy.entity.ts
│   └── strategy-script-version.entity.ts
├── services/
│   ├── strategies.service.ts
│   └── strategy-scripts.service.ts
└── strategy-management.module.ts
```

## 5. 前端交互
- **策略列表页**：展示基础信息，可搜索/过滤，提供快捷入口进入策略详情。
- **策略详情页**：
  - 使用 Monaco Editor（`@monaco-editor/react`）呈现脚本源码。
  - 支持在对话框中新建或编辑脚本版本，保存后刷新版本列表。
  - manifest 以 JSON 文本形式输入/预览，用于记录入口文件、依赖、脚本描述。
- **示例脚本模板**：
  - 默认填充 `defineStrategy` demo 代码，便于快速起步。
  - 开发者可自定义版本号，也可留空由后端生成。

## 6. 校验与版本追踪
- 版本保存时校验：
  - 版本号重复校验（同一策略下不可重复）。
  - Manifest 若提供，需为对象结构且 `entry`/`main` 字段为非空字符串。
- 设为主版本时，自动取消同策略其他脚本的主版本标记。
- 审计字段记录创建/更新人，便于后续追踪。

## 7. 调试与扩展
- 后续可在保存脚本时接入 TypeScript 语法检查 / ESLint 检查。
- 可扩展“运行配置”或“依赖声明”字段，纳入 manifest。
- 预留将脚本版本与回测任务绑定的接口（任务引用 `script_id` + 参数快照即可）。

## 8. 示例请求
- **新建脚本版本**
  ```json
  POST /strategy-management/strategies/1/scripts
  {
    "versionCode": "v1.0.0",
    "description": "初始版本",
    "scriptSource": "import { defineStrategy } from '@platform/backtest-sdk';\nexport default defineStrategy({...});",
    "manifest": {
      "entry": "src/index.ts",
      "sdkVersion": "1.0.0"
    },
    "isPrimary": true
  }
  ```
- **更新脚本版本**
  ```json
  PATCH /strategy-management/scripts/12
  {
    "scriptSource": "// 新脚本内容",
    "changelog": "优化信号过滤",
    "isPrimary": true
  }
  ```

## 9. 未来迭代
- 脚本仓库与 Git 集成，支持差异对比、回滚。
- 脚本自动解析注册的变量/因子，生成回测配置模板。
- 引入草稿/发布状态，用于控制投产流程。
- 接入权限模型，按团队/角色控制脚本编辑与版本管理权。
- **策略详情 & 版本页**
  - 路由：`/backtest/strategies/:strategyId`。
  - 组件期望数据：策略元信息、版本列表（含 `isPrimary`、`status`、`releasedAt` 等字段）。
  - 上传版本时，前端将 JSON 输入转换为字符串传给后端，后端负责解析与校验。
