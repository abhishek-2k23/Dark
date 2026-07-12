# Portal

A pnpm + Turborepo monorepo for the **Portal** application.

## Structure

### Apps

- `apps/portal` — Expo (SDK 56) mobile app, the main product.
- `apps/api` — Express + tRPC + OpenAPI backend server.
- `apps/web` — Next.js site hosting only **Privacy**, **Help**, and **Delete Account** pages.

### Packages

- `@repo/database` — Drizzle ORM + PostgreSQL schema and client.
- `@repo/trpc` — tRPC router (shared between api and clients).
- `@repo/services` — Business-logic layer.
- `@repo/logger` — Winston logger.
- `@repo/eslint-config`, `@repo/typescript-config` — Shared configs.

## Getting Started

```sh
# 1. Install dependencies (uses a hoisted node_modules layout for Expo)
pnpm install

# 2. Create your env file
cp .env.example .env

# 3. Start Postgres
docker compose up -d

# 4. Generate & run migrations
pnpm db:generate
pnpm db:migrate

# 5. Run everything (api + web)
pnpm dev
```

### Mobile app

```sh
cd apps/portal
pnpm start   # or: pnpm android / pnpm ios / pnpm web
```

## Database

PostgreSQL runs in the `portal-postgres` container (see `docker-compose.yml`), database name `portal`.
Update the schema in `packages/database/schema.ts`, then run `pnpm db:generate`.
