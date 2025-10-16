# 交易分析平台 - 前端应用

基于 React + TypeScript + Vite + Ant Design 构建的交易分析平台前端应用。

## 功能特性

- ✅ **Hello World 页面** - 展示欢迎信息
- ✅ **后端 API 集成** - 与 NestJS 后端通信
- ✅ **健康检查** - 实时检查后端服务状态
- ✅ **现代化 UI** - 基于 Ant Design 的美观界面
- ✅ **响应式设计** - 支持移动端和桌面端
- ✅ **TypeScript** - 完整的类型安全

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发环境启动

```bash
# 启动开发服务器
npm run dev

# 应用将在 http://localhost:5173 启动
```

### 生产环境

```bash
# 构建项目
npm run build

# 预览构建结果
npm run preview
```

## 项目结构

```
src/
├── App.tsx          # 主应用组件
├── App.css          # 应用样式
├── main.tsx         # 应用入口
└── vite-env.d.ts    # Vite 类型定义
```

## 技术栈

- **React 19** - 用户界面库
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 现代化构建工具
- **Ant Design** - 企业级 UI 组件库
- **Axios** - HTTP 客户端

## API 集成

前端应用与后端 API 进行通信：

- **Hello World**: `GET http://localhost:3000/api/v1/`
- **健康检查**: `GET http://localhost:3000/api/v1/health`

确保后端服务在 `http://localhost:3000` 运行。

## 开发命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览构建结果
npm run preview
```

## 页面功能

### 主页面

- **欢迎信息** - 显示平台介绍
- **API 测试** - 测试与后端的连接
- **健康检查** - 查看后端服务状态
- **技术栈展示** - 显示使用的技术

### 交互功能

- **获取欢迎消息** - 从后端获取 Hello World 消息
- **健康检查** - 检查后端服务运行状态
- **错误处理** - 友好的错误提示信息

## 样式设计

- 使用 Ant Design 组件库
- 响应式布局设计
- 现代化的视觉效果
- 良好的用户体验

## 下一步计划

- [ ] 添加路由系统
- [ ] 实现用户认证界面
- [ ] 创建交易数据展示页面
- [ ] 添加图表可视化
- [ ] 实现策略管理界面
- [ ] 添加回测结果展示

## 开发注意事项

1. 确保后端服务已启动
2. 检查 API 地址配置
3. 注意 CORS 跨域设置
4. 保持代码风格一致