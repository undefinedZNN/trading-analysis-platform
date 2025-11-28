# Phase 1 执行指南

**创建时间**: 2025-11-27  
**状态**: 待执行

---

## ✅ 已完成的工作

### 1. 数据库迁移脚本
✅ 文件: `src/migrations/1732700000000-AddAssetTypeAndContractSpecs.ts`
- 添加 `asset_type` 列（默认值：'crypto'）
- 添加 `contract_specs` 列（JSONB）
- 创建索引 `idx_datasets_asset_type`

### 2. Entity 更新
✅ 文件: `src/trading-data/entities/dataset.entity.ts`
- 添加 `ContractSpecs` 接口
- 添加 `assetType` 字段
- 添加 `contractSpecs` 字段

### 3. 数据清理脚本
✅ 文件: `cleanup-data-for-migration.sql`
- 清理 `backtest_tasks` 表
- 清理 `datasets` 表
- 清理 `import_tasks` 表

---

## 🚀 执行步骤

### Step 1: 清理历史数据（必需）

**方式一：使用 SQL 脚本（推荐）**

```bash
# 进入 backend 目录
cd /Volumes/CODE/trading-analysis-platform/backend

# 连接数据库并执行清理脚本
psql -U postgres -d trading_platform -f cleanup-data-for-migration.sql
```

**方式二：使用 psql 直接执行**

```bash
psql -U postgres -d trading_platform << 'EOF'
-- 清理数据
TRUNCATE TABLE backtest_tasks CASCADE;
TRUNCATE TABLE datasets CASCADE;
TRUNCATE TABLE import_tasks CASCADE;

-- 验证
SELECT COUNT(*) FROM backtest_tasks;
SELECT COUNT(*) FROM datasets;
EOF
```

**方式三：使用数据库客户端工具**
- 使用 DBeaver、pgAdmin 等工具
- 连接到数据库
- 执行 `cleanup-data-for-migration.sql` 文件

---

### Step 2: 运行数据库迁移

```bash
# 确保在 backend 目录
cd /Volumes/CODE/trading-analysis-platform/backend

# 运行迁移
npm run migration:run
```

**预期输出**:
```
query: SELECT * FROM "typeorm_metadata" "typeorm_metadata"
query: SELECT * FROM "migrations" "migrations"
query: START TRANSACTION
query: ALTER TABLE "datasets" ADD "asset_type" text NOT NULL DEFAULT 'crypto'
query: ALTER TABLE "datasets" ADD "contract_specs" jsonb
query: CREATE INDEX "idx_datasets_asset_type" ON "datasets" ("asset_type")
query: INSERT INTO "migrations"("timestamp", "name") VALUES ($1, $2)
query: COMMIT
✅ Added asset_type and contract_specs columns to datasets table

Migration AddAssetTypeAndContractSpecs1732700000000 has been executed successfully.
```

---

### Step 3: 验证迁移结果

```bash
# 连接数据库验证
psql -U postgres -d trading_platform << 'EOF'
-- 检查 datasets 表结构
\d datasets

-- 验证新列存在
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'datasets'
  AND column_name IN ('asset_type', 'contract_specs');

-- 验证索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'datasets'
  AND indexname = 'idx_datasets_asset_type';
EOF
```

**预期结果**:
- `asset_type` 列存在，类型为 `text`，默认值为 `'crypto'`
- `contract_specs` 列存在，类型为 `jsonb`
- 索引 `idx_datasets_asset_type` 已创建

---

## ❌ 如果需要回滚

```bash
# 回滚迁移
npm run migration:revert
```

这将：
1. 删除索引 `idx_datasets_asset_type`
2. 删除列 `contract_specs`
3. 删除列 `asset_type`

---

## 🔍 故障排查

### 问题1: 迁移失败 - 列已存在

**错误信息**:
```
column "asset_type" of relation "datasets" already exists
```

**解决方案**:
```bash
# 检查列是否已存在
psql -U postgres -d trading_platform -c "\d datasets"

# 如果列已存在但数据不对，需要先删除
psql -U postgres -d trading_platform << 'EOF'
DROP INDEX IF EXISTS idx_datasets_asset_type;
ALTER TABLE datasets DROP COLUMN IF EXISTS contract_specs;
ALTER TABLE datasets DROP COLUMN IF EXISTS asset_type;
EOF

# 然后重新运行迁移
npm run migration:run
```

---

### 问题2: 数据库连接失败

**检查数据库是否运行**:
```bash
# 检查 PostgreSQL 状态
psql -U postgres -d trading_platform -c "SELECT version();"

# 或检查 Docker 容器
docker ps | grep postgres
```

**检查连接配置**:
```bash
# 查看环境变量
cat .env | grep DB_
```

---

### 问题3: 权限错误

**错误信息**:
```
permission denied for table datasets
```

**解决方案**:
```bash
# 使用 postgres 超级用户执行
sudo -u postgres psql -d trading_platform -f cleanup-data-for-migration.sql
```

---

## 📊 Phase 1 完成检查清单

完成以下检查后，Phase 1 即可标记为完成：

- [ ] 历史数据已清理（`backtest_tasks`、`datasets`、`import_tasks` 表为空）
- [ ] 数据库迁移已成功运行
- [ ] `datasets` 表包含 `asset_type` 列
- [ ] `datasets` 表包含 `contract_specs` 列
- [ ] 索引 `idx_datasets_asset_type` 已创建
- [ ] Entity 文件无 lint 错误
- [ ] 迁移文件无 lint 错误
- [ ] 可以成功启动后端服务（`npm run start:dev`）

---

## 🎯 下一步

Phase 1 完成后，继续 **Phase 2: 类型定义和DTO**

主要任务：
1. 创建共享类型定义（`AssetType`, `CommissionType` 等）
2. 重构 `ExecutionConfigDto`
3. 更新前端类型定义

---

## 📞 需要帮助？

如果遇到问题：
1. 检查上面的故障排查部分
2. 查看数据库日志：`docker logs postgres-container`
3. 查看后端日志：检查控制台输出
4. 询问 AI 助手

---

**祝执行顺利！** 🚀

