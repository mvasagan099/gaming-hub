# Gaming Hub

A multiplayer gaming platform: Phaser-based browser games (Chess, Ludo, Snake & Ladder, Cricket, Fruit Ninja) with real-time matchmaking, friend lists, coin wallet with wagers, leaderboards, achievements, and admin moderation.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, React Router (code-split routes), Zustand, Socket.io client, Phaser 3
- **API**: Fastify 5 (Node 22, ESM), Prisma + PostgreSQL, Redis (rate limits), JWT (Supabase), Zod
- **Realtime**: Socket.io server with Redis adapter (horizontal scaling), matchmaking + room management
- **Infra**: Docker Compose (PostgreSQL 16, Redis 7, nginx reverse proxy)

## Monorepo layout

```
apps/web            Vite SPA (games, lobby, wallet, admin)
apps/api            Fastify REST API (auth, wallet, matches, admin, GDPR, metrics)
apps/socket-server  Socket.io realtime server (auth, matchmaking, rooms)
packages/db         Prisma schema + client (runtime JS shim in dist/)
packages/shared     Shared error codes, permission/RBAC model
packages/socket     Typed Socket.io event contracts
packages/game-engine Game logic used by the socket server
scripts/            DB backup/restore tooling
```

## Prerequisites

- Node.js 22+
- Docker + Docker Compose (for Postgres/Redis, and full-stack deployment)

## Local development

```bash
npm install

# 1. Start infra (Postgres on :5540, Redis on :56379)
npm run infra:up

# 2. Configure environment
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/socket-server/.env.example apps/socket-server/.env
cp apps/web/.env.example apps/web/.env

# 3. Generate the Prisma client and sync the schema
npm run db:generate
npm run db:push

# 4. Run web + api + socket concurrently
npm run dev
```

- Web: http://localhost:5173 · API: http://localhost:4000 · Socket: http://localhost:4001
- Health: `GET /health/live` and `GET /health/ready` (DB check) on the API.
- Admin UI is gated by RBAC; the first `ADMIN` role is assigned via `apps/api/src/seed.ts`.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | api, socket | `postgresql://user:pass@host:port/db` |
| `SUPABASE_URL` | api, socket | Auth provider base URL |
| `INTERNAL_API_KEY` | api, socket | Shared secret for `/internal/*` and `/metrics` |
| `CORS_ORIGIN` | api, socket | Comma-separated allowed origins, or `*` |
| `REQUIRE_EMAIL_VERIFICATION` | api, socket | `true`/`false`; defaults to `true` in production |
| `RATE_LIMIT_MAX` | api | Global request budget per minute |
| `BODY_LIMIT` | api | Max JSON body size in bytes (default 262144) |
| `REDIS_URL` | socket | Optional Redis adapter for multi-instance scaling |
| `API_URL` | socket | Internal API base URL (`http://api:4000` in Docker) |
| `VITE_API_URL` | web | Build-time; use `/api` when served behind nginx |
| `VITE_SOCKET_URL` | web | Build-time; leave unset to connect same-origin |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | web | Browser auth |

## Database

Schema changes use Prisma's push workflow (no migration history in the repo):

```bash
npm run db:generate   # regenerate client after schema edits
npm run db:push       # apply schema changes
npm run db:studio     # browse data
```

### Backup / restore

Dumps run inside the Postgres container, so no local `pg_dump` is required:

```bash
npm run db:backup                          # writes backups/gaming-hub-<ts>.dump
npm run db:restore -- backups/<file>.dump  # restores a snapshot
```

## Full-stack deployment (Docker Compose)

One command builds and runs the web app (nginx on http://localhost:8080), API, socket server, Postgres, and Redis, applying the schema first:

```bash
docker compose up -d --build
```

- The API and socket containers are not exposed to the host; nginx proxies `/api/` and `/socket.io/` (WebSocket upgrade) and serves the SPA with caching.
- `VITE_API_URL=/api` and no `VITE_SOCKET_URL` are baked into the web build for same-origin traffic.
- `SUPABASE_URL` and `INTERNAL_API_KEY` can be overridden with the same-named host environment variables (defaults are dev-only placeholders).
- Stop with `docker compose down` (volumes persist).

## Metrics

The API exposes Prometheus metrics at `GET /metrics` (text exposition format, no dependencies). Gate with the shared key:

```bash
curl -H "x-internal-key: $INTERNAL_API_KEY" http://localhost:4000/metrics
```

Tracked: per-route request counts by status, global request duration histogram, process start/uptime/RSS/heap.

## Security notes

- CSP `default-src 'none'` + `frame-ancestors 'none'` on the API; hardened CORS, request body/param limits, and per-route rate limits; failed-login lockout and account soft-delete/anonymization (GDPR export + delete).
- RBAC (`USER` / `MODERATOR` / `ADMIN`) enforced per route via `packages/shared/src/permissions.ts`.
- **Dependency audit**: `npm audit` flags `GHSA-qwww-vcr4-c8h2` (React Router RSC-mode CSRF bypass). This project is a client-side SPA with no RSC/server actions, so the advisory does not apply; the recommended `audit fix --force` downgrade would reintroduce earlier XSS/open-redirect advisories (fixed only in current 7.18.x), so it is intentionally not applied.
