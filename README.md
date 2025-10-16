# 交易分析平台

基于现代技术栈构建的综合性交易分析平台，支持回测、策略开发和市场数据分析。

## 技术栈

### 后端
- **NestJS** - 企业级 Node.js 框架
- **TypeScript** - 类型安全的开发体验
- **PostgreSQL** - 业务数据和元数据的主数据库
- **Redis** - 缓存、会话管理和实时数据

### 前端
- **React** - 现代化 UI 库
- **Vite** - 快速构建工具和开发服务器
- **TypeScript** - 类型安全的前端开发
- **Ant Design** - 专业的 UI 组件库

### 数据与分析
- **Parquet + DuckDB** - 历史数据存储和分析
- **TypeScript** - 回测脚本和策略开发

## 快速开始

### 环境要求
- Node.js 18+ 
- Docker & Docker Compose
- Git

### 本地开发环境搭建

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd trading-analysis-platform
   ```

2. **启动开发数据库**
   ```bash
   # 启动 PostgreSQL 和 Redis
   make dev-up-local
   
   # 检查服务运行状态
   make status
   ```

3. **环境配置**
   ```bash
   # 复制环境变量模板
   make setup-env
   
   # 编辑 .env 文件进行配置
   # 默认值适用于本地开发环境
   ```

4. **数据库初始化**
   PostgreSQL 容器会在首次启动时自动运行初始化脚本。
   
   手动重置数据库：
   ```bash
   make dev-reset
   ```

### 开发服务

- **PostgreSQL**: `localhost:5432`
  - 数据库: `trading_analysis`
  - 用户: `trading_user`
  - 密码: `trading_password`

- **Redis**: `localhost:6379`
  - 无密码（仅开发环境）
  - 数据库: 0

### 常用命令

```bash
# 启动开发数据库
make dev-up-local

# 停止开发数据库
make dev-down

# 查看日志
make dev-logs

# 重置所有数据（删除数据卷）
make dev-reset

# 连接到 PostgreSQL
make db-connect

# 连接到 Redis CLI
make redis-connect
```

## 项目结构

```
trading-analysis-platform/
├── backend/                 # NestJS 后端应用
├── frontend/               # React 前端应用
├── scripts/               # 数据库和工具脚本
├── config/                # 配置文件
├── docs/                  # 文档
├── docker-compose.dev.yml # 开发环境配置
├── docker-compose.local.yml # 本地环境配置
├── Makefile              # 开发命令
└── .env.example          # 环境变量模板
```

## 数据库架构

平台使用多模式的 PostgreSQL 数据库：

- **users**: 用户管理和身份认证
- **trading**: 市场数据、交易工具和交易相关数据
- **analytics**: 策略、回测和分析结果

## 开发流程

1. 使用 Docker 启动开发数据库
2. 配置环境变量
3. 开发后端和前端应用
4. 使用提供的数据库架构和 Redis 进行数据管理

## 下一步计划

- [ ] 搭建 NestJS 后端应用
- [ ] 搭建 React 前端应用
- [ ] 实现身份认证系统
- [ ] 创建市场数据接入管道
- [ ] 开发回测引擎
- [ ] 构建策略管理界面

## 网络问题排查

如果遇到 Docker 镜像拉取问题，请参考 `NETWORK_TROUBLESHOOTING.md` 文档。

## 贡献指南

请阅读我们的贡献指南，并确保所有测试通过后再提交 Pull Request。

## 许可证

[待定]
