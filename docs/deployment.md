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

Worked example (this project's Neon endpoint, `ap-southeast-2`):

```
pooled:  ...@ep-restless-water-a7n95axt-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
direct:  ...@ep-restless-water-a7n95axt.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

The local `.env` keeps the Neon string under a separate `NEON_CONENCTION_URL` key
(the pooled endpoint) while `DATABASE_URL` points at local Docker Postgres — so
local dev and Neon don't collide. Use the **direct** form above for both the
`DATABASE_URL` you set on Render *and* any migration you run by hand.

Keep `?sslmode=require&channel_binding=require`. A single Render instance holds a
small Prisma connection pool against the direct endpoint, which is well within
Neon's limits. (If you later scale to many instances, switch the app to the
pooled URL and add a Prisma `directUrl` for migrations.)

### Applying the schema by hand

The **build command** (below) runs `prisma migrate deploy` on every deploy, so
the schema is created automatically. To apply it once yourself against a fresh
Neon database (e.g. before the first deploy), run it with the **direct**
`DATABASE_URL` overriding the local one. `prisma.config.ts` loads `.env`
non-destructively, so a pre-set env var wins:

```powershell
# PowerShell
cd packages/database
$env:DATABASE_URL = "postgresql://<user>:<password>@ep-restless-water-a7n95axt.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
npx prisma migrate deploy      # applies committed migrations (idempotent)
npx tsx seed.ts                # optional: load the demo seed
Remove-Item Env:DATABASE_URL   # so local dev keeps using Docker
```

```sh
# bash
cd packages/database
DATABASE_URL="postgresql://<user>:<password>@ep-restless-water-a7n95axt.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" \
  npx prisma migrate deploy
```

The demo seed (`npx tsx seed.ts`) creates `admin@greenmeadows.test` /
`password123`, plus a guard and two residents — handy for a first smoke test,
but skip it if you want an empty production database.

## 2. Render web service

New → **Web Service** → connect this repo.

| Setting | Value |
|---|---|
| **Language / Runtime** | Node |
| **Root Directory** | *(blank — the monorepo root; pnpm needs it)* |
| **Build Command** | see below |
| **Start Command** | `pnpm --filter @repo/api start` |
| **Health Check Path** | `/health` |

**Build Command** (paste as a single line — Render's build-command box doesn't
handle `\` line continuations):

```sh
npm i -g pnpm@9 && pnpm install --frozen-lockfile --prod=false && pnpm --filter @repo/database db:generate && pnpm --filter @repo/database exec prisma migrate deploy && pnpm --filter @repo/api build
```

- `npm i -g pnpm@9` — installs pnpm to npm's writable global prefix. **Do not use
  `corepack enable`**: Render's current images already ship pnpm at `/usr/bin/pnpm`
  on a read-only filesystem, so `corepack enable` dies with
  `EROFS: read-only file system, unlink '/usr/bin/pnpm'`. Pinning `@9` keeps the
  CLI in lockstep with the committed `pnpm-lock.yaml` (`packageManager: pnpm@9.0.0`)
  so `--frozen-lockfile` can't drift.
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

**Pin Node to 22 (LTS).** The repo ships a committed `.node-version` file
(`22`) that Render honors, so builds don't drift onto whatever is newest. Leaving
it unpinned lets Render pick the latest (e.g. Node 26), for which `argon2` and
Prisma don't yet publish prebuilt binaries — the build then fails or falls back
to a slow source compile. `engines.node` stays `>=18` as a floor; `.node-version`
(or a `NODE_VERSION` env var) is what actually selects the build's Node.

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
| `OTP_DEV_ECHO` | ⛔ | **Leave unset in prod.** When `true`, login/resend responses echo the raw email-OTP code (`devCode`) so you can log in without a real mailer — a dev-only convenience that leaks the OTP if enabled in production. The local `.env` ships with `OTP_DEV_ECHO="true"`; make sure that value does **not** carry over to Render. |
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
