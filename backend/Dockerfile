FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package*.json ./
# prisma e tsx (seed) estão nas dependências normais
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY assets ./assets
COPY --from=build /app/dist ./dist
EXPOSE 3333
# aplica as migrations, cria o primeiro usuário (se ainda não existe) e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/server.js"]
