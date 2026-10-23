# SplitWisee API image (JSON API only; the frontend is built and served separately).
#   docker build -t splitwisee-api ./backend
#   docker run --env-file backend/.env -p 127.0.0.1:5000:5000 -v /srv/splitwisee/receipts:/app/private-receipts splitwisee-api
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY database ./database
COPY scripts ./scripts
RUN mkdir -p /app/private-receipts && chown -R node:node /app
USER node
ENV PORT=5000 HOST=0.0.0.0 RECEIPT_DIR=/app/private-receipts
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
