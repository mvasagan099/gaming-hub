# syntax=docker/dockerfile:1

# Builder for the web app (Vite). Set VITE_API_URL=/api (same-origin via nginx)
# and leave VITE_SOCKET_URL unset so socket.io connects to the current origin.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/socket-server/package.json apps/socket-server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/socket/package.json packages/socket/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w @gaming-hub/web

# ---- runtime ----
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
