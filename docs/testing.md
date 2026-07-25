# Backend Testing

How the Prangan backend is tested, and the conventions to follow when adding tests.

Run everything from the repo root:

```bash
pnpm test          # all packages via turbo
pnpm check-types   # tsc --noEmit across the workspace
```

Current suite: **360 tests** — `@repo/auth` (10), `@repo/cloudinary` (8),
`@repo/services` (327 across 24 files), `@repo/trpc` (15 across 2 files).

## Runner

[Vitest](https://vitest.dev) (`vitest run`) in each package. Packages that touch
the database load the root `.env` first via `dotenv -e ../../.env --` (see the
`test` script in `packages/services` and `packages/trpc`), so `DATABASE_URL`
resolves to the same Postgres the dev server uses.

## Two kinds of test

| Kind | Where | Touches DB? | What it proves |
|---|---|---|---|
| **Pure unit** | `packages/auth`, `packages/cloudinary`, `packages/services/profile/media-url.test.ts` | No | Hashing, JWT, Cloudinary signing, URL validation — deterministic, no fixtures. |
| **Service + DB** | `packages/services/<domain>/*.service.test.ts` | Yes | A service function end-to-end against real Postgres — the primary coverage layer. |
| **Router permission** | `packages/trpc/server/routes/permissions.test.ts` | No | Role-gating middleware rejects the wrong role before any service/DB code runs (uses a fake `ctx.user`, no fixtures). |

External services are mocked, never called for real: `google-auth-library`
(fake verifier keyed on `valid:<email>` tokens) and the Expo push client
(captures sent messages in-memory). Cloudinary signing is exercised against its
own signer, offline.

## Database convention (real Postgres, `runId`-namespaced)

There is **no separate test database**. Tests run against the dev Postgres
(`docker compose up -d` → the `portal-postgres` container) and isolate
themselves rather than resetting the schema:

- Each test **file** mints a unique `runId` at load time
  (`Date.now().toString(36)`, often via `vi.hoisted`) and stamps it into every
  fixture it creates — society names, emails (`resident-a-${runId}@test.local`),
  phone numbers, etc. Concurrent files therefore never collide.
- `beforeAll` creates just the hierarchy that file needs (society → tower →
  flat → users → …).
- `afterAll` deletes everything that file created, in FK-safe order, then
  `prisma.$disconnect()`. A file leaves the database as it found it.

**When adding a test that writes to the DB:**

1. Derive a `runId` and namespace every unique/looked-up field with it — never
   hard-code an email or society name that another file might also use.
2. Create fixtures in `beforeAll`, tear them down in `afterAll`. Delete children
   before parents to satisfy foreign keys.
3. Assert `TRPCError` **codes** (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
   `CONFLICT`, `PRECONDITION_FAILED`, …), not message strings — see the
   `expectTRPCError` helper pattern reused across the service tests.

### Trade-off (why not a dedicated test DB)

The `runId` approach keeps the toolchain zero-config — no second database, no
migration/reset step, tests run wherever the dev DB already runs. The cost is
that tests share a live database, so they must clean up after themselves and
must not assume an empty table. If the suite ever moves to CI or needs full
isolation, the upgrade path is a separate `DATABASE_URL` (e.g. `portal_test`)
plus a Vitest `globalSetup` that runs `prisma migrate deploy` and truncates
between files — the per-file `runId` fixtures keep working unchanged on top of
it.
