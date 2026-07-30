# 手机靓号展示系统 - Spaceship Hyperlift 容器镜像
# Hyperlift 是容器化运行时，必须提供 Dockerfile 才能构建部署

FROM node:22-alpine

# 工作目录
WORKDIR /app

# 先拷贝依赖清单（利用 Docker 层缓存，依赖不变时不重复安装）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 拷贝应用代码（node_modules / data / .env 已被 .dockerignore 排除）
COPY . .

# 运行时环境变量
# Hyperlift 会把外部请求转发到这个端口，必须监听 0.0.0.0
ENV PORT=3000
# 数据持久化目录（建议在 Hyperlift 挂载一个持久卷到这里，否则重新部署会清空数据）
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 3000

# 启动（server.js 内部已按 process.env.PORT 监听 0.0.0.0）
CMD ["node", "server.js"]
