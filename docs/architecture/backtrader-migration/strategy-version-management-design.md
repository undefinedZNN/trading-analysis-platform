# 策略版本管理设计方案

**版本**: v1.0  
**创建时间**: 2025-11-20  
**状态**: 需求调研阶段

---

## 📋 核心问题

1. **版本变更历史**：如何记录策略代码的变更历史？
2. **版本回滚**：如何回退到历史版本？
3. **版本对比**：如何比较两个版本的差异（diff）？
4. **版本标签**：是否支持版本标签（如 v1.0、stable）？
5. **版本关联**：如何关联回测结果到具体版本？
6. **代码审计**：如何追溯"谁在何时修改了什么"？

---

## 🎯 需求场景

### 场景 1：策略迭代

```
Day 1: 用户创建策略 v1
  - 简单的MA双均线策略
  - 参数：fast=10, slow=20
  
Day 2: 优化策略 → v2
  - 加入RSI过滤
  - 参数：fast=10, slow=20, rsi_threshold=70
  
Day 3: 再次优化 → v3
  - 加入止损逻辑
  - 参数：fast=10, slow=20, rsi_threshold=70, stop_loss=0.05
  
Day 10: 发现 v3 表现不佳
  - 需要回退到 v2
  - 需要对比 v2 和 v3 的差异
```

**需求**：
- ✅ 保留所有历史版本
- ✅ 快速回滚
- ✅ 版本对比（代码 diff）

---

### 场景 2：多人协作

```
用户 A: 修改策略代码（增加功能）
用户 B: 同时修改参数配置
用户 C: 查看策略历史，想知道谁改了什么
```

**需求**：
- ✅ 记录修改人
- ✅ 记录修改时间
- ✅ 记录修改原因（commit message）
- ✅ 代码审计日志

---

### 场景 3：回测结果追溯

```
用户运行了 100 次回测
某次回测表现特别好（收益 50%）
想找回那次回测用的策略代码和参数
```

**需求**：
- ✅ 回测结果关联到具体版本
- ✅ 可以查看该版本的完整代码和参数
- ✅ 可以基于该版本重新回测

---

### 场景 4：生产版本管理

```
v1.0: 开发版（测试中）
v1.1: 开发版（测试中）
v2.0: 稳定版（已验证，可用于实盘） ⭐
v2.1: 开发版（新功能）
```

**需求**：
- ✅ 版本标签（stable、beta、deprecated）
- ✅ 版本说明（changelog）
- ✅ 版本发布流程

---

## 📊 现有表结构分析

### script_versions 表

```sql
CREATE TABLE script_versions (
  script_version_id UUID PRIMARY KEY,
  strategy_id UUID,  -- 所属策略
  version_number INT,  -- 版本号
  code TEXT,  -- 策略代码
  parameter_schema JSONB,  -- 参数定义
  factor_schema JSONB,  -- 因子定义
  description TEXT,  -- 版本说明
  created_at TIMESTAMP,
  created_by UUID,  -- 创建人
  is_active BOOLEAN  -- 是否为当前版本
);
```

**特点**：
- ✅ 已经支持多版本（version_number）
- ✅ 记录了创建时间和创建人
- ✅ 有版本说明字段

**不足**：
- ❌ 没有记录修改原因（commit message）
- ❌ 没有版本标签（tag）
- ❌ 没有变更历史（只有最终状态）

---

## 🎨 版本管理方案对比

### 方案 A：简单版本列表（基于现有表） ⭐

**特点**：
- 基于现有的 `script_versions` 表
- 每次修改创建新版本
- 保留所有历史版本

**实现**：

```typescript
// 1. 创建新版本
async createVersion(strategyId: string, code: string, parameterSchema: any) {
  // 获取当前最大版本号
  const latestVersion = await this.scriptVersionRepo.findOne({
    where: { strategy_id: strategyId },
    order: { version_number: 'DESC' }
  });
  
  const newVersionNumber = (latestVersion?.version_number || 0) + 1;
  
  // 创建新版本
  const newVersion = this.scriptVersionRepo.create({
    strategy_id: strategyId,
    version_number: newVersionNumber,
    code: code,
    parameter_schema: parameterSchema,
    created_by: userId,
    is_active: true
  });
  
  // 将旧版本设为非活跃
  await this.scriptVersionRepo.update(
    { strategy_id: strategyId, is_active: true },
    { is_active: false }
  );
  
  return await this.scriptVersionRepo.save(newVersion);
}

// 2. 获取版本历史
async getVersionHistory(strategyId: string) {
  return await this.scriptVersionRepo.find({
    where: { strategy_id: strategyId },
    order: { version_number: 'DESC' }
  });
}

// 3. 回滚到指定版本
async rollbackToVersion(strategyId: string, versionNumber: number) {
  const targetVersion = await this.scriptVersionRepo.findOne({
    where: { strategy_id: strategyId, version_number: versionNumber }
  });
  
  if (!targetVersion) {
    throw new Error('Version not found');
  }
  
  // 方式 1：直接将该版本设为活跃
  await this.scriptVersionRepo.update(
    { strategy_id: strategyId, is_active: true },
    { is_active: false }
  );
  
  await this.scriptVersionRepo.update(
    { script_version_id: targetVersion.script_version_id },
    { is_active: true }
  );
  
  // 方式 2：基于该版本创建新版本（推荐，保留回滚记录）
  return await this.createVersion(
    strategyId,
    targetVersion.code,
    targetVersion.parameter_schema,
    `Rollback to version ${versionNumber}`
  );
}

// 4. 版本对比（代码 diff）
async compareVersions(versionId1: string, versionId2: string) {
  const [v1, v2] = await Promise.all([
    this.scriptVersionRepo.findOne(versionId1),
    this.scriptVersionRepo.findOne(versionId2)
  ]);
  
  // 使用 diff 库生成差异
  const codeDiff = diff.diffLines(v1.code, v2.code);
  const parameterDiff = diff.diffJson(v1.parameter_schema, v2.parameter_schema);
  
  return {
    codeDiff,
    parameterDiff
  };
}
```

**前端展示**：

```tsx
// 版本历史列表
function VersionHistory({ strategyId }) {
  const versions = useVersionHistory(strategyId);
  
  return (
    <Timeline>
      {versions.map(version => (
        <Timeline.Item key={version.version_number}>
          <div>
            <Tag color={version.is_active ? 'green' : 'default'}>
              v{version.version_number}
            </Tag>
            {version.is_active && <Badge status="success" text="当前版本" />}
          </div>
          <div>{version.description}</div>
          <div>
            <Text type="secondary">
              {version.created_by} • {formatDate(version.created_at)}
            </Text>
          </div>
          <div>
            <Button size="small" onClick={() => viewVersion(version)}>
              查看
            </Button>
            <Button size="small" onClick={() => compareWith(version)}>
              对比
            </Button>
            {!version.is_active && (
              <Button size="small" onClick={() => rollback(version)}>
                回滚
              </Button>
            )}
          </div>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

// 版本对比页面
function VersionComparison({ version1, version2 }) {
  const diff = useVersionDiff(version1.id, version2.id);
  
  return (
    <Tabs>
      <TabPane tab="代码对比" key="code">
        <ReactDiffViewer
          oldValue={version1.code}
          newValue={version2.code}
          splitView={true}
          leftTitle={`v${version1.version_number}`}
          rightTitle={`v${version2.version_number}`}
        />
      </TabPane>
      <TabPane tab="参数对比" key="params">
        <JsonDiffViewer
          oldValue={version1.parameter_schema}
          newValue={version2.parameter_schema}
        />
      </TabPane>
    </Tabs>
  );
}
```

**优点**：
- ✅ 实现简单，基于现有表
- ✅ 满足基本需求
- ✅ 无需额外存储

**缺点**：
- ⚠️ 没有 commit message
- ⚠️ 没有版本标签
- ⚠️ 没有详细的变更历史（只能对比代码）

**适用场景**：
- MVP 阶段
- 单人使用
- 简单的版本管理

---

### 方案 B：Git 风格的版本管理

**特点**：
- 类似 Git 的 commit、tag、branch
- 记录详细的变更历史
- 支持版本标签

**数据库设计**：

```sql
-- 策略版本表（保持不变）
CREATE TABLE script_versions (
  script_version_id UUID PRIMARY KEY,
  strategy_id UUID,
  version_number INT,
  code TEXT,
  parameter_schema JSONB,
  factor_schema JSONB,
  created_at TIMESTAMP,
  created_by UUID,
  is_active BOOLEAN
);

-- 版本提交记录表（新增）⭐
CREATE TABLE version_commits (
  commit_id UUID PRIMARY KEY,
  script_version_id UUID,  -- 关联版本
  parent_commit_id UUID,  -- 父提交（用于构建历史链）
  commit_message TEXT,  -- 提交说明
  commit_type VARCHAR(50),  -- 提交类型（create, update, rollback）
  changes JSONB,  -- 变更摘要
  created_at TIMESTAMP,
  created_by UUID
);

-- 版本标签表（新增）⭐
CREATE TABLE version_tags (
  tag_id UUID PRIMARY KEY,
  script_version_id UUID,  -- 关联版本
  tag_name VARCHAR(100),  -- 标签名（如 v1.0, stable）
  tag_type VARCHAR(50),  -- 标签类型（release, beta, stable, deprecated）
  description TEXT,  -- 标签说明
  created_at TIMESTAMP,
  created_by UUID
);

-- 回测结果与版本关联（现有表扩展）
ALTER TABLE backtest_tasks 
ADD COLUMN script_version_id UUID;  -- 关联版本
```

**实现**：

```typescript
// 1. 创建版本（带 commit message）
async createVersionWithCommit(
  strategyId: string, 
  code: string, 
  parameterSchema: any,
  commitMessage: string,
  userId: string
) {
  // 获取当前活跃版本（作为父版本）
  const currentVersion = await this.scriptVersionRepo.findOne({
    where: { strategy_id: strategyId, is_active: true }
  });
  
  // 创建新版本
  const newVersion = await this.createVersion(strategyId, code, parameterSchema, userId);
  
  // 计算变更
  const changes = this.calculateChanges(currentVersion, newVersion);
  
  // 创建 commit 记录
  const commit = this.versionCommitRepo.create({
    script_version_id: newVersion.script_version_id,
    parent_commit_id: currentVersion?.latest_commit_id,  // 父提交
    commit_message: commitMessage,
    commit_type: 'update',
    changes: changes,
    created_by: userId
  });
  
  await this.versionCommitRepo.save(commit);
  
  return { version: newVersion, commit };
}

// 2. 计算变更摘要
calculateChanges(oldVersion, newVersion) {
  const changes = {
    code_changed: oldVersion?.code !== newVersion.code,
    parameters_changed: !_.isEqual(
      oldVersion?.parameter_schema, 
      newVersion.parameter_schema
    ),
    factors_changed: !_.isEqual(
      oldVersion?.factor_schema, 
      newVersion.factor_schema
    ),
    lines_added: 0,
    lines_removed: 0
  };
  
  if (changes.code_changed && oldVersion) {
    const diff = diffLines(oldVersion.code, newVersion.code);
    changes.lines_added = diff.filter(d => d.added).reduce((sum, d) => sum + d.count, 0);
    changes.lines_removed = diff.filter(d => d.removed).reduce((sum, d) => sum + d.count, 0);
  }
  
  return changes;
}

// 3. 添加标签
async addTag(versionId: string, tagName: string, tagType: string, description: string) {
  // 检查标签是否已存在
  const existingTag = await this.versionTagRepo.findOne({
    where: { script_version_id: versionId, tag_name: tagName }
  });
  
  if (existingTag) {
    throw new Error(`Tag ${tagName} already exists`);
  }
  
  const tag = this.versionTagRepo.create({
    script_version_id: versionId,
    tag_name: tagName,
    tag_type: tagType,
    description: description,
    created_by: userId
  });
  
  return await this.versionTagRepo.save(tag);
}

// 4. 获取版本历史（包含 commit 信息）
async getVersionHistoryWithCommits(strategyId: string) {
  const versions = await this.scriptVersionRepo.find({
    where: { strategy_id: strategyId },
    order: { version_number: 'DESC' },
    relations: ['commits', 'tags']
  });
  
  return versions.map(v => ({
    ...v,
    commit_message: v.commits?.[0]?.commit_message,
    changes: v.commits?.[0]?.changes,
    tags: v.tags.map(t => t.tag_name)
  }));
}

// 5. 获取标签版本
async getVersionByTag(strategyId: string, tagName: string) {
  const tag = await this.versionTagRepo.findOne({
    where: { tag_name: tagName },
    relations: ['version']
  });
  
  if (!tag || tag.version.strategy_id !== strategyId) {
    throw new Error('Tag not found');
  }
  
  return tag.version;
}
```

**前端展示**：

```tsx
// 版本历史（Git 风格）
function GitStyleVersionHistory({ strategyId }) {
  const versions = useVersionHistoryWithCommits(strategyId);
  
  return (
    <List
      dataSource={versions}
      renderItem={version => (
        <List.Item>
          <List.Item.Meta
            avatar={<Avatar icon={<CodeOutlined />} />}
            title={
              <Space>
                <Text strong>v{version.version_number}</Text>
                {version.is_active && <Tag color="green">Current</Tag>}
                {version.tags.map(tag => (
                  <Tag key={tag} color="blue">{tag}</Tag>
                ))}
              </Space>
            }
            description={
              <>
                <div>{version.commit_message}</div>
                <div>
                  <Text type="secondary">
                    {version.created_by} committed {formatRelativeTime(version.created_at)}
                  </Text>
                  {version.changes && (
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                      +{version.changes.lines_added} -{version.changes.lines_removed}
                    </Text>
                  )}
                </div>
              </>
            }
          />
          <Space>
            <Button size="small" icon={<EyeOutlined />}>查看</Button>
            <Button size="small" icon={<DiffOutlined />}>对比</Button>
            <Button size="small" icon={<TagOutlined />}>标签</Button>
            {!version.is_active && (
              <Button size="small" icon={<RollbackOutlined />}>回滚</Button>
            )}
          </Space>
        </List.Item>
      )}
    />
  );
}

// 添加标签弹窗
function AddTagModal({ versionId }) {
  const [form] = Form.useForm();
  
  const onSubmit = async (values) => {
    await addTag(versionId, values.tag_name, values.tag_type, values.description);
    message.success('标签已添加');
  };
  
  return (
    <Modal title="添加标签" visible onOk={() => form.submit()}>
      <Form form={form} onFinish={onSubmit}>
        <Form.Item name="tag_name" label="标签名称" rules={[{ required: true }]}>
          <Input placeholder="如 v1.0, stable" />
        </Form.Item>
        <Form.Item name="tag_type" label="标签类型" rules={[{ required: true }]}>
          <Select>
            <Option value="release">Release</Option>
            <Option value="beta">Beta</Option>
            <Option value="stable">Stable</Option>
            <Option value="deprecated">Deprecated</Option>
          </Select>
        </Form.Item>
        <Form.Item name="description" label="说明">
          <TextArea rows={4} placeholder="版本说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

**优点**：
- ✅ 详细的变更历史
- ✅ Commit message 记录修改原因
- ✅ 支持版本标签
- ✅ 可构建完整的历史链
- ✅ 便于代码审计

**缺点**：
- ⚠️ 实现复杂
- ⚠️ 需要新增表
- ⚠️ 数据量更大

**适用场景**：
- 多人协作
- 生产环境
- 需要严格的版本管理

---

### 方案 C：集成 Git（外部存储）

**特点**：
- 将策略代码存储到 Git 仓库
- 利用 Git 的版本管理能力
- 数据库只存储元数据

**架构**：

```
数据库（script_versions）
  ├─ 版本元数据（version_number, 创建时间等）
  ├─ git_commit_hash (关联到 Git commit)
  └─ 参数配置（parameter_schema）

Git 仓库（/data/strategies-repo/）
  ├─ strategy-001/
  │   ├─ v1.py
  │   ├─ v2.py
  │   └─ ...
  ├─ strategy-002/
  └─ ...
```

**实现**：

```typescript
import simpleGit from 'simple-git';
const git = simpleGit('/data/strategies-repo');

// 1. 创建新版本（写入 Git）
async createVersionWithGit(strategyId: string, code: string, commitMessage: string) {
  const filePath = `strategy-${strategyId}/strategy.py`;
  
  // 写入文件
  await fs.writeFile(`/data/strategies-repo/${filePath}`, code);
  
  // Git commit
  await git.add(filePath);
  const commit = await git.commit(commitMessage);
  
  // 保存元数据到数据库
  const newVersion = await this.scriptVersionRepo.save({
    strategy_id: strategyId,
    version_number: await this.getNextVersionNumber(strategyId),
    git_commit_hash: commit.commit,  // 关联 Git commit
    parameter_schema: parameterSchema,
    created_by: userId
  });
  
  return newVersion;
}

// 2. 获取版本代码（从 Git 读取）
async getVersionCode(versionId: string) {
  const version = await this.scriptVersionRepo.findOne(versionId);
  
  // 从 Git 读取该 commit 的代码
  const code = await git.show([`${version.git_commit_hash}:strategy-${version.strategy_id}/strategy.py`]);
  
  return code;
}

// 3. 版本对比（使用 Git diff）
async compareVersionsWithGit(versionId1: string, versionId2: string) {
  const [v1, v2] = await Promise.all([
    this.scriptVersionRepo.findOne(versionId1),
    this.scriptVersionRepo.findOne(versionId2)
  ]);
  
  // 使用 Git diff
  const diff = await git.diff([v1.git_commit_hash, v2.git_commit_hash]);
  
  return diff;
}

// 4. 回滚（Git checkout）
async rollbackWithGit(strategyId: string, versionId: string) {
  const targetVersion = await this.scriptVersionRepo.findOne(versionId);
  
  // Git checkout 到该 commit
  const filePath = `strategy-${strategyId}/strategy.py`;
  const code = await git.show([`${targetVersion.git_commit_hash}:${filePath}`]);
  
  // 创建新版本（基于该代码）
  return await this.createVersionWithGit(
    strategyId,
    code,
    `Rollback to v${targetVersion.version_number}`
  );
}
```

**优点**：
- ✅ 利用 Git 成熟的版本管理能力
- ✅ 支持完整的 Git 功能（branch, tag, diff）
- ✅ 可以用 Git 工具查看历史
- ✅ 代码审计能力强

**缺点**：
- ⚠️ 依赖 Git 服务
- ⚠️ 实现复杂
- ⚠️ 需要管理 Git 仓库
- ⚠️ 不适合前端直接操作

**适用场景**：
- 大型团队
- 需要 Git 功能（branch, merge）
- 代码审计要求高

---

## 🎯 推荐方案

### MVP 阶段：方案 A（简单版本列表） ⭐⭐⭐

**理由**：
- ✅ 基于现有表，实现简单
- ✅ 满足基本需求（版本历史、回滚、对比）
- ✅ 无需额外存储
- ✅ 快速上线

**实现步骤**：
1. ✅ 版本列表展示
2. ✅ 版本查看
3. ✅ 版本对比（代码 diff）
4. ✅ 版本回滚

---

### 正式生产（可选升级）：方案 B（Git 风格） ⭐⭐

**理由**：
- ✅ 更专业的版本管理
- ✅ 支持 commit message 和标签
- ✅ 便于代码审计
- ✅ 渐进式升级（在方案 A 基础上扩展）

**升级路径**：
- 第一阶段：方案 A（MVP）
- 第二阶段：添加 commit 表和标签表（方案 B）
- 第三阶段（可选）：集成 Git（方案 C）

---

## ❓ 待确认的问题

### 1. 版本说明（description）是否必填？

**问题**：用户创建新版本时，是否必须填写版本说明？

**选项**：
- **A. 选填**：方便快速保存
- **B. 必填**：强制用户记录修改原因 ⭐

**你的选择**：[ ]

---

### 2. 版本回滚方式

**问题**：回滚到旧版本时，如何处理？

**选项**：
- **A. 直接激活旧版本**（简单）
  - 优点：简单直接
  - 缺点：丢失"回滚"这个操作记录
  
- **B. 基于旧版本创建新版本** ⭐（推荐）
  - 优点：保留完整历史，包括回滚操作
  - 缺点：版本号会增加

**你的选择**：[ ]

---

### 3. 版本自动保存

**问题**：是否需要自动保存草稿版本？

**选项**：
- **A. 不需要**：用户手动保存
- **B. 需要**：每隔 N 分钟或用户离开时自动保存草稿

**如果需要，如何区分正式版本和草稿？**
- 添加 `is_draft` 字段
- 草稿版本不计入 `version_number`

**你的选择**：[ ]

---

### 4. 版本删除

**问题**：是否允许删除历史版本？

**选项**：
- **A. 不允许删除**：保留完整历史 ⭐
  - 只能标记为 deprecated（废弃）
  
- **B. 允许删除**：用户可以删除旧版本
  - 但不能删除有关联回测结果的版本

**你的选择**：[ ]

---

### 5. 版本标签（Tag）

**问题**：是否需要在 MVP 阶段就实现版本标签？

**选项**：
- **A. 不需要**：MVP 阶段先不做 ⭐
  - 简化实现
  
- **B. 需要**：直接实现标签功能
  - 方便用户标记重要版本

**你的选择**：[ ]

---

### 6. 版本命名

**问题**：版本号如何生成？

**当前方案**：自动递增（v1, v2, v3...）

**是否需要支持自定义版本号？**
- **A. 不需要**：自动递增 ⭐
- **B. 需要**：用户可以自定义（如 v1.0.1）

**你的选择**：[ ]

---

## 📚 相关文档

- [Backtrader 最终方案](./backtrader-final-solution.md)
- [策略参数设计](./strategy-parameters-design.md)
- [Worker 通信设计](./worker-communication-design.md)

---

**下一步**：确认上述问题后，我会创建详细的版本管理实现代码和前端组件。

