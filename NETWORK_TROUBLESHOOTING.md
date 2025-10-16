# Docker 网络问题解决方案

## 问题描述
Docker 无法从 registry 拉取镜像，出现网络超时错误。

## 解决方案

### 方案1: 配置 Docker 镜像加速器

#### 1.1 配置 Docker Desktop (macOS)
1. 打开 Docker Desktop
2. 进入 Settings > Docker Engine
3. 添加以下配置：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

4. 点击 "Apply & Restart"

#### 1.2 配置 Docker CLI (Linux/macOS)
创建或编辑 `/etc/docker/daemon.json`:

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

重启 Docker 服务：
```bash
sudo systemctl restart docker
```

### 方案2: 手动拉取镜像

```bash
# 拉取 PostgreSQL 镜像
docker pull postgres:15-alpine

# 拉取 Redis 镜像  
docker pull redis:7-alpine

# 然后启动服务
make dev-up-local
```

### 方案3: 使用国内镜像源

```bash
# 使用中科大镜像源
docker pull docker.mirrors.ustc.edu.cn/library/postgres:15-alpine
docker pull docker.mirrors.ustc.edu.cn/library/redis:7-alpine

# 重新标记镜像
docker tag docker.mirrors.ustc.edu.cn/library/postgres:15-alpine postgres:15-alpine
docker tag docker.mirrors.ustc.edu.cn/library/redis:7-alpine redis:7-alpine
```

### 方案4: 检查网络连接

```bash
# 检查 DNS 解析
nslookup registry-1.docker.io

# 检查网络连接
curl -I https://registry-1.docker.io/v2/

# 检查代理设置
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

### 方案5: 临时解决方案 - 使用本地数据库

如果 Docker 问题持续存在，可以临时使用本地安装的数据库：

#### PostgreSQL (Homebrew)
```bash
# 安装
brew install postgresql@15

# 启动服务
brew services start postgresql@15

# 创建数据库
createdb trading_analysis
```

#### Redis (Homebrew)
```bash
# 安装
brew install redis

# 启动服务
brew services start redis
```

## 验证解决方案

配置完成后，运行以下命令验证：

```bash
# 测试 Docker 连接
docker run hello-world

# 启动开发环境
make dev-up-local

# 检查服务状态
make status
```

## 常见问题

### Q: 仍然无法拉取镜像
A: 尝试重启 Docker Desktop，或者使用 VPN

### Q: 镜像拉取很慢
A: 配置多个镜像源，Docker 会自动选择最快的

### Q: 企业网络环境
A: 联系网络管理员配置代理设置

## 推荐配置

对于中国大陆用户，推荐使用以下镜像源配置：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com",
    "https://dockerhub.azk8s.cn"
  ],
  "max-concurrent-downloads": 10,
  "log-driver": "json-file",
  "log-level": "warn",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```
