FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && \
    DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy npx prisma generate

COPY tsconfig.json ./
COPY . .

RUN npx tsc && cp config/*.js dist/config/

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
