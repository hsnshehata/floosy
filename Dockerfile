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

CMD ["node", "server/server.js"]
