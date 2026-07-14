# Multi-stage Node production container for Backend Server
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY server/package*.json ./
RUN npm ci --only=production

FROM node:18-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY server/ .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
