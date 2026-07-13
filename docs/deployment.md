# Backend Deployment — Render + Neon

How to deploy `apps/api` (Express + tRPC + OpenAPI) to [Render](https://render.com)
with [Neon](https://neon.tech) Postgres. Manual dashboard setup (no `render.yaml`).

## 1. Database (Neon)

Create a Neon project and grab the connection string from the dashboard.

**Use the _direct_ (non-pooler) endpoint as `DATABASE_URL`.** Neon's pooled
endpoint runs PgBouncer in transaction mode, which breaks Prisma's migration
advisory locks. The direct host is the pooled host with `-pooler` removed:

```
pooled:  ...@ep-xxxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
direct:  ...@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
                    ^ no "-pooler"
```

Keep `?sslmode=require&channel_binding=require`. A single Render instance holds a
small Prisma connection pool against the direct endpoint, which is well within
Neon's limits. (If you later scale to many instances, switch the app to the
pooled URL and add a Prisma `directUrl` for migrations.)

Migrations and seed data are applied by the **build command** (below), so the
schema is created automatically on first deploy. They were also applied once
during setup, so the DB is already live with the demo seed
(`admin@greenmeadows.test` / `password123`, plus guard + two residents).

## 2. Render web service

New → **Web Service** → connect this repo.

| Setting | Value |
|---|---|
| **Language / Runtime** | Node |
| **Root Directory** | *(blank — the monorepo root; pnpm needs it)* |
| **Build Command** | see below |
| **Start Command** | `pnpm --filter @repo/api start` |
| **Health Check Path** | `/health` |

**Build Command:**

```sh
corepack enable && pnpm install --frozen-lockfile --prod=false && \
pnpm --filter @repo/database db:generate && \
pnpm --filter @repo/database exec prisma migrate deploy && \
pnpm --filter @repo/api build
```

- `--prod=false` — forces devDependencies (tsup, the Prisma CLI) to install even
  if `NODE_ENV` is set at build time, so the build tools are available. (pnpm
  only auto-skips devDeps when `NODE_ENV=production` exactly; this app uses
  `prod`, but `--prod=false` makes it bulletproof.)
- `db:generate` — generates the Prisma client (+ the Linux query engine).
- `prisma migrate deploy` — applies committed migrations to Neon. Idempotent;
  a no-op once the schema is current.
- `@repo/api build` — tsup bundles the app to `apps/api/dist/index.js`. Native
  modules (`argon2`, `@prisma/client`) stay external and load from
  `node_modules` at runtime — they are direct deps of `apps/api` so pnpm's
  isolated layout resolves them. The bundle uses tsup `shims: true` so deps that
  call `createRequire(import.meta.url)` work in the CJS output.

The **Start Command** runs `node dist/index.js`. Render injects `PORT`; the app
reads it automatically.

### Node version

argon2 and Prisma ship prebuilt binaries for `linux-x64`, so any Node ≥18 works.
To pin it, add a `NODE_VERSION` env var (e.g. `22`).

## 3. Environment variables

Set these in the Render dashboard (**Environment** tab). Never commit real
secrets — `.env` is gitignored.

| Var | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon **direct** connection string (see §1) |
| `NODE_ENV` | ✅ | **`prod`** — the app's enum is `prod`, *not* `production`. This flips on prod CORS behavior. |
| `JWT_SECRET` | ✅ | 32+ random bytes — signs access & password-reset tokens |
| `PAYMENT_WEBHOOK_SECRET` | ✅ | Random string — verifies payment-gateway webhook signatures |
| `BASE_URL` | ✅ | Your service URL, e.g. `https://portl-api.onrender.com` — used in the OpenAPI `servers` list and the `/docs` link |
| `PORT` | — | Injected by Render; do **not** set |
| `ALLOWED_ORIGINS` | ⬜ | Comma-separated browser origins for CORS. Native mobile clients don't need it. Unset = no CORS headers. |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth web client id — required only for "Sign in with Google" |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ⬜ | Enables signed media uploads; unset = uploads return 412 and URL validation is skipped |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MIN` | ⬜ | Auth rate limit (defaults 10 / 15 min) |
| `VISITOR_PENDING_TTL_MIN` | ⬜ | Minutes before a PENDING visitor auto-expires (default 15) |

Generate the two secrets locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # PAYMENT_WEBHOOK_SECRET
```

## 4. Verify after deploy

```sh
curl https://<your-service>.onrender.com/health
# -> {"message":"Portal server is healthy","healthy":true}

# Interactive API docs:
open https://<your-service>.onrender.com/docs

# DB-backed login (demo seed):
curl -X POST https://<your-service>.onrender.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@greenmeadows.test","password":"password123"}'
```

Point the mobile app's API base URL at `https://<your-service>.onrender.com`
(tRPC surface `/trpc`, REST/OpenAPI surface `/api/v1`).

## Notes & gotchas

- **The expiry sweep runs in-process** every 60s (stale visitors → EXPIRED,
  lapsed pre-approvals → EXPIRED, past-due dues → OVERDUE). Fine on one
  instance; on multiple instances it runs redundantly but harmlessly.
- **Free tiers sleep.** Render Free spins the service down after ~15 min idle
  and Neon Free autosuspends compute — expect a multi-second cold start on the
  first request after idle. Use paid instances to avoid this.
- **`pnpm-lock.yaml` must be committed** (it is) so `--frozen-lockfile`
  succeeds on Render.
- **Rotate the Neon password** if the connection string was ever shared in
  plaintext (Neon dashboard → Roles → reset password), then update
  `DATABASE_URL`.
