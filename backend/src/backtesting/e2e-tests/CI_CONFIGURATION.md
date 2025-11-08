# CI 配置指南

**版本**: 1.0  
**最后更新**: 2024-11-08  
**维护者**: AI Assistant

---

## 📋 目录

1. [概述](#概述)
2. [GitHub Actions配置](#github-actions配置)
3. [触发机制](#触发机制)
4. [环境变量](#环境变量)
5. [通知配置](#通知配置)
6. [性能基准](#性能基准)
7. [故障排查](#故障排查)

---

## 概述

### CI/CD 流程

我们使用 **GitHub Actions** 实现持续集成，包括：

- ✅ **PR 测试**: 每个 Pull Request 自动运行E2E测试
- ✅ **Push 测试**: 推送到主分支时运行测试
- ✅ **Nightly 测试**: 每天凌晨2点运行全面测试
- ✅ **性能监控**: 自动生成性能基准报告
- ✅ **通知集成**: Slack/Email通知测试结果

### 工作流文件

| 文件 | 用途 | 触发时机 |
|------|------|---------|
| `e2e-tests.yml` | PR和Push测试 | PR创建/更新, Push到main |
| `nightly-tests.yml` | 每日全面测试 | 每天 2:00 AM UTC |

---

## GitHub Actions配置

### 1. e2e-tests.yml - PR/Push测试

**位置**: `.github/workflows/e2e-tests.yml`

**触发条件**:
```yaml
on:
  pull_request:
    branches: [ main, develop ]
  push:
    branches: [ main ]
  workflow_dispatch:  # 手动触发
```

**测试任务**:

#### Job 1: e2e-tests
- **矩阵策略**: Node 18.x + 20.x
- **测试套件**: 
  - Basic Tests (5分钟)
  - Advanced Tests (10分钟)
  - All Tests (15分钟)
- **产物**: 测试结果、报告

#### Job 2: performance-benchmark
- **条件**: 仅PR触发
- **任务**: 性能基准测试
- **产物**: 性能报告

#### Job 3: code-quality
- **任务**: Lint + TypeScript检查
- **产物**: 代码质量报告

**示例配置**:
```yaml
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run test:e2e
```

---

### 2. nightly-tests.yml - 每日测试

**位置**: `.github/workflows/nightly-tests.yml`

**触发条件**:
```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # 每天 2:00 AM UTC
  workflow_dispatch:
```

**测试任务**:

#### Job 1: comprehensive-tests
- **矩阵策略**: Node 18.x + 20.x × 4种测试套件
- **测试套件**: basic, advanced, all, stress
- **产物**: 每日测试结果

#### Job 2: stability-test
- **任务**: 连续运行10次测试
- **目的**: 检测不稳定的测试
- **产物**: 稳定性报告

#### Job 3: memory-leak-test
- **任务**: 内存泄漏检测
- **限制**: 最大512MB内存
- **产物**: 内存使用报告

#### Job 4: performance-trend
- **任务**: 性能趋势分析
- **产物**: 性能基准历史数据

#### Job 5: notify-results
- **任务**: 汇总并通知结果
- **通知**: Slack + Email

---

## 触发机制

### 自动触发

#### 1. Pull Request
```yaml
on:
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'backend/src/backtesting/**'
      - 'backend/package.json'
```

**触发条件**:
- PR 创建
- PR 更新（新commit）
- 目标分支: main, develop
- 文件变更: backtesting目录或package.json

#### 2. Push to Main
```yaml
on:
  push:
    branches: [ main ]
```

**触发条件**:
- 直接推送到main分支
- Merge PR到main

#### 3. Scheduled (Nightly)
```yaml
on:
  schedule:
    - cron: '0 2 * * *'
```

**触发时间**: 每天凌晨2点（UTC）

### 手动触发

所有workflow都支持手动触发：

```yaml
on:
  workflow_dispatch:
```

**操作步骤**:
1. 进入 GitHub 仓库
2. Actions 标签
3. 选择 workflow
4. "Run workflow" 按钮

---

## 环境变量

### 必需的Secrets

在 GitHub 仓库设置中配置：

#### 1. SLACK_WEBHOOK_URL
**用途**: Slack通知  
**获取方式**:
1. 登录 Slack workspace
2. Apps → Incoming Webhooks
3. Add to Slack
4. 选择频道
5. 复制 Webhook URL

**配置**:
```
Settings → Secrets and variables → Actions → New repository secret
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### 2. EMAIL_USERNAME & EMAIL_PASSWORD
**用途**: Email通知  
**推荐**: 使用应用专用密码

**Gmail配置**:
1. 启用2FA
2. 生成应用专用密码
3. 配置Secrets:
   - `EMAIL_USERNAME`: your-email@gmail.com
   - `EMAIL_PASSWORD`: your-app-password

#### 3. NOTIFICATION_EMAIL
**用途**: 接收测试失败通知  
**配置**: your-team@example.com

### 可选的Variables

#### 1. NODE_VERSION
**默认**: 18.x, 20.x  
**用途**: 自定义Node版本

#### 2. TEST_TIMEOUT
**默认**: 30 minutes  
**用途**: 测试超时时间

---

## 通知配置

### Slack通知

**配置文件**: 两个workflow都包含Slack通知

**通知时机**:
- ✅ 测试失败
- ✅ Nightly测试完成

**消息格式**:
```
🚨 E2E Tests Failed!

Repository: your-org/your-repo
Branch: refs/heads/main
Commit: abc123...
Node: 20.x

View details: [链接]
```

**自定义**:
```yaml
- name: Notify on Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: |
      Custom message here
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Email通知

**配置文件**: `nightly-tests.yml`

**通知时机**:
- ✅ Nightly测试失败

**邮件内容**:
```
Subject: 🚨 Nightly E2E Tests Failed

Body:
Nightly E2E tests have failed.

Date: 2024-11-08 02:00:00 UTC
Branch: main
Commit: abc123...

Results:
- Comprehensive Tests: failed
- Stability Test: success
- Memory Leak Test: success
- Performance Trend: success

View details: [链接]
```

**自定义**:
```yaml
- name: Send Email Notification
  if: failure()
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: Custom Subject
    to: ${{ secrets.NOTIFICATION_EMAIL }}
    from: GitHub Actions
    body: |
      Custom email body
```

### PR评论

**自动PR评论**包含：
- ✅ 测试结果摘要
- ✅ 性能报告
- ✅ 代码质量报告

**示例**:
```markdown
## 🧪 E2E Test Results

**Node Version**: 20.x
**Run Date**: 2024-11-08 12:00:00 UTC
**Commit**: abc123...

✅ Basic Tests: PASSED
✅ Advanced Tests: PASSED
✅ All Tests: PASSED

---
**Workflow Run**: [#123](link)
```

---

## 性能基准

### 性能报告生成

**Job**: `performance-benchmark` (在e2e-tests.yml)

**流程**:
1. 运行所有E2E测试
2. 提取测试持续时间
3. 生成性能报告
4. PR评论中显示

**报告格式**:
```markdown
## ⚡ Performance Report

| Test | Duration |
|------|----------|
| PriceEcho | 2.3s |
| FixedRebalance | 3.1s |
| RiskStress | 2.8s |
| SnapshotResume | 4.5s |
| EdgeCases | 1.9s |

**Total Duration**: 14.6s
```

### 性能趋势分析

**Job**: `performance-trend` (在nightly-tests.yml)

**功能**:
- ✅ 每日记录性能基准
- ✅ 存储历史数据
- ✅ 生成趋势报告

**存储位置**: `.performance-history/perf-YYYY-MM-DD.txt`

**对比命令**:
```bash
# 对比最近两次性能
diff .performance-history/perf-2024-11-07.txt \
     .performance-history/perf-2024-11-08.txt
```

---

## 故障排查

### 问题1: Workflow未触发

**症状**: PR创建后workflow未运行

**可能原因**:
1. workflow文件路径错误
2. YAML语法错误
3. 分支限制

**解决方案**:
```bash
# 1. 检查文件路径
ls -la .github/workflows/

# 2. 验证YAML语法
npx yaml-lint .github/workflows/*.yml

# 3. 检查分支配置
cat .github/workflows/e2e-tests.yml | grep -A 2 "on:"
```

### 问题2: 测试失败但本地通过

**症状**: CI测试失败，本地测试通过

**可能原因**:
1. 环境差异
2. 依赖版本
3. 超时设置

**解决方案**:
```bash
# 1. 使用相同Node版本
nvm use 20

# 2. 清理并重装依赖
rm -rf node_modules package-lock.json
npm install

# 3. 检查CI日志
# GitHub Actions → 失败的workflow → 查看详细日志
```

### 问题3: Slack通知未发送

**症状**: 测试失败但未收到Slack通知

**可能原因**:
1. Webhook URL错误
2. Secret未配置
3. 通知条件不满足

**解决方案**:
```bash
# 1. 验证Secret配置
# Settings → Secrets → 检查SLACK_WEBHOOK_URL

# 2. 测试Webhook
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test message"}' \
  YOUR_WEBHOOK_URL

# 3. 检查条件
# if: failure() 确保存在
```

### 问题4: 性能下降

**症状**: 测试运行时间显著增加

**可能原因**:
1. 数据量增加
2. 代码性能问题
3. CI资源限制

**解决方案**:
```bash
# 1. 对比性能历史
cat .performance-history/perf-*.txt | grep "Total Duration"

# 2. 本地性能分析
time npm run test:e2e

# 3. 优化测试
# - 减少数据量
# - 并行测试
# - 缓存依赖
```

---

## 最佳实践

### 1. 快速反馈

✅ **PR测试快速完成**:
- Basic tests: <5分钟
- Advanced tests: <10分钟
- 使用缓存加速依赖安装

### 2. 完整覆盖

✅ **Nightly测试全面**:
- 所有测试套件
- 稳定性测试
- 内存泄漏检测
- 性能趋势

### 3. 及时通知

✅ **失败立即通知**:
- Slack通知团队
- Email通知责任人
- PR评论显示结果

### 4. 性能监控

✅ **跟踪性能趋势**:
- 每日记录基准
- 对比历史数据
- 及早发现退化

### 5. 文档维护

✅ **保持文档更新**:
- workflow变更时更新文档
- 记录新的配置项
- 分享最佳实践

---

## 扩展配置

### 添加新的测试套件

1. **创建测试文件**:
```typescript
// run-custom-tests.ts
import { createTestRunner } from './runner/test-runner';
// ... 注册测试
```

2. **更新workflow**:
```yaml
- name: Run Custom Tests
  run: npx ts-node src/backtesting/e2e-tests/run-custom-tests.ts
```

### 添加新的通知渠道

**Discord通知**:
```yaml
- name: Discord Notification
  uses: sarisia/actions-status-discord@v1
  with:
    webhook: ${{ secrets.DISCORD_WEBHOOK }}
    status: ${{ job.status }}
```

**Microsoft Teams通知**:
```yaml
- name: Teams Notification
  uses: aliencube/microsoft-teams-actions@v0.8.0
  with:
    webhook_uri: ${{ secrets.TEAMS_WEBHOOK }}
    summary: Test Results
```

---

## 维护清单

### 每周
- [ ] 检查workflow运行状态
- [ ] 查看失败的测试
- [ ] 更新依赖版本

### 每月
- [ ] 审查性能趋势
- [ ] 清理旧的artifacts
- [ ] 更新文档

### 每季度
- [ ] 全面审查CI配置
- [ ] 优化workflow
- [ ] 团队培训

---

## 参考资料

- [GitHub Actions文档](https://docs.github.com/en/actions)
- [E2E测试指南](./E2E_TEST_GUIDE.md)
- [维护指南](./MAINTENANCE.md)

---

**文档版本**: 1.0  
**最后更新**: 2024-11-08  
**维护者**: AI Assistant

