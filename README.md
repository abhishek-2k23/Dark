# Prangan

A pnpm + Turborepo monorepo for the **Prangan** application.

## Structure

### Apps

- `apps/portal` — Expo (SDK 56) mobile app, the main product.
- `apps/api` — Express + tRPC + OpenAPI backend server.
- `apps/web` — Next.js site hosting only **Privacy**, **Help**, and **Delete Account** pages.

### Packages

- `@repo/database` — Prisma ORM + PostgreSQL schema, client, and seed.
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

# 4. Generate the Prisma client & run migrations
pnpm db:generate
pnpm db:migrate

# 5. Seed sample data (1 society, towers, flats, admin/guard/resident users)
pnpm --filter @repo/database db:seed

# 6. Run everything (api + web)
pnpm dev
```

### Mobile app

```sh
cd apps/portal
pnpm start   # or: pnpm android / pnpm ios / pnpm web
```

## API docs

Interactive docs (Scalar) are served at `http://localhost:8000/docs`, backed by
the raw spec at `/openapi.json`.

**Regenerate the committed spec** (`docs/openapi.json`) after changing any route:

```sh
pnpm openapi:generate
```

**Adding a new documented endpoint:** follow the checklist in
[`docs/api-conventions.md`](docs/api-conventions.md) — in short, every
procedure needs `meta.openapi` (method, path, tags, summary, description,
`protect`), named Zod schemas with `.describe()` on each field, and mutation
descriptions listing their error cases.

**Postman:** import [`docs/postman-collection.json`](docs/postman-collection.json)
(folders per tag). Set the `baseUrl` variable, run **Auth → Log in** with a
seeded account, and the returned token is captured into `bearerToken`
automatically for the protected requests.

## Testing

```sh
pnpm test          # Vitest across all packages (169 tests)
pnpm check-types   # tsc --noEmit across the workspace
```

Tests run against the dev Postgres and namespace their own fixtures — see
[`docs/testing.md`](docs/testing.md) for the conventions.

## Deployment

The backend deploys to **Render** (web service) with **Neon** Postgres. Build
and start commands, the full environment-variable table, and post-deploy
verification are in [`docs/deployment.md`](docs/deployment.md).

## Database

PostgreSQL runs in the `portal-postgres` container (see `docker-compose.yml`), database name `portal`.
Update the schema in `packages/database/prisma/schema.prisma`, then run
`pnpm db:migrate` (creates a migration + regenerates the client).
The entity relationship diagram lives in [`docs/erd.md`](docs/erd.md).

Seeded dev logins (password `password123` for LOCAL accounts):

| Role | Email |
|---|---|
| Admin | `admin@greenmeadows.test` |
| Guard | `guard@greenmeadows.test` |
| Resident (LOCAL) | `ravi@example.test` |
| Resident (GOOGLE) | `priya@example.test` (Google-only, no password) |
