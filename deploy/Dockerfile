# 零 npm 依赖镜像：不需要 npm install，构建快、供应链面小
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public
COPY data ./data

# 以非 root 运行；上面 COPY 的文件默认 644，可读
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
