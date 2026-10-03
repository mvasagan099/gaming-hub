# syntax=docker/dockerfile:1

# Builder for the API and Socket-server (Node 22, ESM).
# Build with:  docker build -t gaming-hub-api  --build-arg SERVICE=api .
#              docker build -t gaming-hub-socket --build-arg SERVICE=socket-server .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---- deps: install once, cache-friendly ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/socket-server/package.json apps/socket-server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/enterprise/package.json packages/enterprise/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/socket/package.json packages/socket/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/multiplayer/package.json packages/multiplayer/package.json
RUN npm ci

# Generate Prisma client against the committed schema
COPY packages/db/prisma packages/db/prisma
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

# ---- build ----
FROM deps AS build
COPY . .
RUN npm run build -w @gaming-hub/multiplayer && \
    npm run build -w @gaming-hub/api && \
    npm run build -w @gaming-hub/socket-server

# Retain the production migration CLI, omit test/build tooling.
FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
# HIGH-2 fix: run as non-root user to limit blast radius if compromised.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeapp
ARG SERVICE=api
ENV SERVICE=${SERVICE}
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/multiplayer ./packages/multiplayer
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/socket-server/dist ./apps/socket-server/dist
USER nodeapp
EXPOSE 4000
CMD ["sh", "-c", "node apps/$SERVICE/dist/index.js"]
