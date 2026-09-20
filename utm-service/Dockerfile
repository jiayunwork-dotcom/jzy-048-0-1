# syntax=docker/dockerfile:1

# ---- 依赖层：仅安装生产依赖 -------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 测试层：镜像内可跑完整测试套件 ------------------------------------------
# 构建：docker build --target test -t utm-service:test .
# 运行：docker run --rm utm-service:test
FROM deps AS test
COPY src ./src
COPY test ./test
CMD ["node", "--test", "test/"]

# ---- 运行层：精简生产镜像 ----------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/index.js"]
