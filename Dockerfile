FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
# Сначала применяем схему/сид (идемпотентно), затем запускаем сервер
CMD ["sh", "-c", "node src/scripts/init-db.js && node src/server.js"]
