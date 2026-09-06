FROM node:20-alpine
WORKDIR /app

# 安装全部依赖（含构建所需的 devDependencies）
COPY package.json package-lock.json ./
RUN npm ci

# 拷贝源码（.env 等平台凭证由 .dockerignore 放行，构建期需要 VITE_* 变量）
COPY . .

# 构建前端 dist/public 与后端 dist/boot.js
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
