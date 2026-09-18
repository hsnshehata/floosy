# فلوسي — صورة واحدة: الواجهة + API + SQLite
FROM node:22-alpine

WORKDIR /app

# التبعيات أولًا (للكاش)
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev && npm cache clean --force

# باقي الملفات (الواجهة + السيرفر)
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 3000

# فحص صحة للحاويات (Coolify/Docker)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"ok":true'

CMD ["node", "server/server.js"]
