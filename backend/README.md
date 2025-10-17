# 交易分析平台 - 后端 API

基于 NestJS 构建的交易分析平台后端 API 服务。

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发环境启动

```bash
# 启动依赖服务（Postgres/Redis）
docker compose -f ../docker-compose.dev.yml up -d postgres redis

# 复制环境变量配置（如已有 .env 可跳过）
cp .env.example .env

# 开发模式（热重载）
npm run start:dev

# 普通启动
npm start

# 调试模式
npm run start:debug

# 如需修改监听端口，设置 PORT 环境变量
PORT=3500 npm run start:dev

# 自定义数据存储目录
RAW_UPLOADS_ROOT=/path/to/raw_uploads DATASETS_ROOT=/path/to/datasets npm run start:dev
```

### 生产环境

```bash
# 构建项目
npm run build

# 启动生产服务
npm run start:prod
```

## API 接口

服务启动后，可以访问以下接口：

### 基础接口

- **Hello World**: `GET http://localhost:3000/api/v1/`
  - 返回欢迎消息

- **健康检查**: `GET http://localhost:3000/api/v1/health`
  - 返回服务健康状态

### API 文档

- **Swagger 文档**: `http://localhost:3000/api/docs`
  - 完整的 API 接口文档

## 项目结构

```
src/
├── app.controller.ts    # 主控制器
├── app.service.ts       # 主服务
├── app.module.ts        # 主模块
└── main.ts             # 应用入口
```

## 开发命令

```bash
# 代码格式化
npm run format

# 代码检查
npm run lint

# 运行测试
npm test

# 测试覆盖率
npm run test:cov

# 监听模式测试
npm run test:watch
```

## 技术栈

- **框架**: NestJS
- **语言**: TypeScript
- **文档**: Swagger/OpenAPI
- **HTTP**: Express

## 环境要求

- Node.js 18+
- npm 或 yarn

## 下一步

- [ ] 添加数据库连接
- [ ] 实现用户认证
- [ ] 添加交易数据接口
- [ ] 实现策略管理
- [ ] 添加回测功能
