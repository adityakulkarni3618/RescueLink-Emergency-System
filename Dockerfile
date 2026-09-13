# Multi-stage Node production container for Backend Server
FROM node:18-slim AS builder

WORKDIR /usr/src/app

COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:18-slim

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY backend/ .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]

