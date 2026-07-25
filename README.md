<div align="center">

<img src="apps/portal/assets/images/icon.png" alt="Prangan logo" width="112" height="112" />

# **Prangan**

### *Where the gate meets the community*

**Society management, end to end** — one system for the guard at the gate,
the resident on their phone, and the committee running the place.

<br />

![Expo](https://img.shields.io/badge/Expo-SDK%2056-000020?style=flat-square&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![tRPC](https://img.shields.io/badge/tRPC-end--to--end%20types-2596BE?style=flat-square&logo=trpc&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?style=flat-square&logo=prisma&logoColor=white)
<br />
![Tests](https://img.shields.io/badge/tests-367%20passing-3FB950?style=flat-square)
![API](https://img.shields.io/badge/API-98%20paths%20·%20116%20operations-8250DF?style=flat-square)
![Screens](https://img.shields.io/badge/mobile-63%20screens-1F6FEB?style=flat-square)

<br />

**[Architecture](architecture.md)** · **[Security](security.md)** · **[Demo logins](credentials.md)**

</div>

---

## The problem

A gated residential community runs on three things that don't talk to each
other: a paper register at the gate, a WhatsApp group for notices, and a
treasurer chasing maintenance dues by phone. Nobody can answer *who visited flat
A-304 last Tuesday*, a notice reaches whoever happens to scroll, and a payment is
a screenshot.

Prangan replaces all three with one system, seen from three sides:

| | Role | What they do |
|:--:|---|---|
| 🏠 | **Resident** | Approve visitors from their phone, pre-approve guests with a QR pass, raise complaints, book amenities, pay dues, vote in polls |
| 🛡️ | **Guard** | Register walk-in visitors, verify guest passes, log entry and exit at the gate |
| ⚙️ | **Admin** | Run the society — towers, flats, residents, staff, notices, polls, dues, offline-payment verification, reports |

---

## Contents

[What's built](#whats-built) · [Tech stack](#tech-stack) · [Layout](#repository-layout) · [Quick start](#quick-start) · [API](#the-api) · [Testing](#testing) · [Deployment](#deployment)

---

## What's built

> Everything below is implemented, tested and deployed — not planned.

<details open>
<summary><b>🔐 Identity and access</b></summary>
<br />

- **Email/phone + password** login with argon2id hashing, plus **Google sign-in**
  verified server-side against Google's certificates.
- **Email OTP verification** — a login resolving to an *unverified* email returns
  an `OTP_REQUIRED` challenge instead of a session, and emails a 6-digit code.
  Phone logins and verified emails get a session directly.
- **Three ways in**, because societies onboard differently: a founding admin
  self-registers a whole society; admins invite residents to a specific flat; an
  uninvited resident requests to join by the admin's email, and the admin
  approves or rejects.
- **Role hierarchy with numeric levels** — `RESIDENT 100 · GUARD 200 · ADMIN 300`,
  with gaps left for future roles.

</details>

<details open>
<summary><b>🚪 The gate</b></summary>
<br />

- **Visitor lifecycle as an enforced state machine**: `PENDING → APPROVED/DENIED`,
  entry only after approval, exit only after entry. Illegal transitions are 409s,
  not silent no-ops.
- **Guest passes** — a resident pre-approves a guest, who gets a QR code and a
  6-character fallback code by email. The guard scans it or types it.
- **Auto-expiry sweeps** retire stale pending visitors and lapsed passes.

</details>

<details open>
<summary><b>🏘️ Community and money</b></summary>
<br />

- **Complaints** with reference codes (`TKT-XXXXXX`), threaded comments, photo
  attachments and a status workflow.
- **Notices** (scheduled or immediate, pinnable), **polls** with single- and
  multi-vote rules, **amenity booking** with slot-overlap prevention.
- **Maintenance dues** generated monthly per flat, idempotently.
- **Payments on three rails** — a gateway flow with an HMAC-signed webhook, a
  UPI-direct flow, and an **offline receipt flow** where the resident uploads
  proof and an admin verifies it. The due stays payable until they do, because a
  receipt is a claim, not a payment.
- **Emergency alarm** — shake the phone or double-tap SOS, confirm through a
  10-second countdown, and the whole society is alerted. The one notification
  allowed to be loud.

</details>

<details open>
<summary><b>🛠️ Operations</b></summary>
<br />

- **Bulk resident import** from `.xlsx`/`.csv`, with a dry-run preview reporting
  every row's outcome before anything is written.
- **PDF and spreadsheet exports** rendered on-device — visitor logs and
  per-resident reports, saved to the phone or shared.
- **Push notifications** for every cross-role event, with an in-app inbox.

</details>

---

## Tech stack

| Layer | Choice | Why this one |
|---|---|---|
| **Monorepo** | pnpm workspaces + Turborepo | One install, cached task graph |
| **API** | Node · Express · tRPC | End-to-end types shared with the app — no hand-written contracts |
| **REST + docs** | trpc-to-openapi · Scalar | The same routers serve tRPC *and* a documented REST surface |
| **Database** | PostgreSQL · Prisma | Society → tower → flat → resident is inherently relational |
| **Validation** | Zod | One schema validates input, types output, *and* documents the API |
| **Auth** | JWT access + opaque refresh · argon2 | Short-lived access, rotating refresh with reuse detection |
| **Mobile** | Expo SDK 56 · React Native 0.85 | One codebase, both platforms |
| **Navigation** | expo-router | File-based routing with role-scoped stacks |
| **Server state** | @trpc/react-query | Caching, invalidation, background refetch |
| **Client state** | Zustand | Session and UI only — server data is never duplicated |
| **Styling** | NativeWind v4 | Tailwind semantics over theme tokens |
| **Media** | Cloudinary | Signed direct-from-device uploads |
| **Testing** | Vitest | 367 tests against a real Postgres |

---

## Repository layout

```
apps/
  api/        Express host — tRPC at /trpc, REST at /api/v1, docs at /docs
  portal/     Expo mobile app — 63 screens across resident, guard and admin stacks
  web/        Next.js — privacy, help and account deletion (app-store requirements)

packages/
  database/   Prisma schema (34 models · 26 enums · 19 migrations), client, seed
  trpc/       Routers, procedures, Zod models, OpenAPI metadata
  services/   Business logic — 15 domains, the only layer that touches Prisma
  auth/       Password hashing, JWT, OTP helpers, permission levels
  mailer/     Nodemailer templates (OTP, password reset, guest pass, tickets)
  cloudinary/ Upload signing and URL validation
  logger/     Winston
  eslint-config · typescript-config
```

The dependency rule runs one way — **routes → services → database**. A route
never touches Prisma; a service never knows about HTTP. That single constraint is
what makes the business logic testable without a server running.

---

## Quick start

> **Prerequisites** — Node ≥ 18, pnpm 9, Docker

```sh
pnpm install                           # 1. install (hoisted layout, required by Expo)
cp .env.example .env                   # 2. environment
docker compose up -d                   # 3. Postgres, in the portal-postgres container
pnpm db:generate                       # 4. Prisma client
pnpm db:migrate                        # 5. schema
pnpm --filter @repo/database db:seed   # 6. demo data
pnpm dev                               # 7. api + web
```

Then the mobile app:

```sh
cd apps/portal
pnpm start          # Expo dev server — or pnpm android / pnpm ios
```

By default the app talks to the **deployed** API, so you can log in immediately
with the accounts in **[credentials.md](credentials.md)** — no local setup
needed. To run fully local, set `EXPO_PUBLIC_API_URL=http://localhost:8000`
first; on Android emulators `localhost` is rewritten to `10.0.2.2` for you.

> [!TIP]
> Start the API through the root `pnpm dev`, not
> `pnpm --filter @repo/api dev` — the latter skips the root dotenv load and
> Prisma won't connect.

---

## The API

One set of tRPC routers, served two ways:

| Surface | Path | For |
|---|---|---|
| **tRPC** | `/trpc/*` | The mobile app — typed transport, superjson |
| **REST** | `/api/v1/*` | Everyone else — plain JSON, **98 paths · 116 operations** |
| **Docs** | `/docs` | Interactive Scalar UI, backed by `/openapi.json` |

The committed spec is [`docs/openapi.json`](docs/openapi.json); there's a
[Postman collection](docs/postman-collection.json) too — import it, set
`baseUrl`, run **Auth → Log in**, and the token is captured automatically for
every protected request.

```sh
pnpm openapi:generate   # regenerate the spec after changing a route
```

Every procedure carries `meta.openapi` — method, path, tags, summary, and a
description listing its error cases — plus named Zod schemas with `.describe()`
on each field. That's why the generated docs read as documentation rather than a
type dump.

> [!NOTE]
> `trpc-to-openapi` returns **415** on POST/PATCH/DELETE without
> `Content-Type: application/json`, even for path-only inputs. Send `{}`.

---

## Testing

```sh
pnpm test          # 367 tests
pnpm check-types   # tsc --noEmit across all 8 packages
```

| Suite | Tests | What it covers |
|---|--:|---|
| `@repo/services` | 334 | Business logic against **real Postgres** |
| `@repo/trpc` | 15 | Permission matrix — every procedure, every role |
| `@repo/auth` | 10 | Hashing, JWT, OTP |
| `@repo/cloudinary` | 8 | Upload signing, URL validation |

Service tests run against a real database rather than mocks, so they catch what
mocks hide: unique-violation shapes, cascade behaviour, and whether a transaction
actually rolls back. Fixtures are namespaced per run and cleaned up afterwards.

> [!IMPORTANT]
> Anything that sends mail must `vi.mock("@repo/mailer")` — the repo `.env` may
> carry live SMTP credentials.

---

## Deployment

| Piece | Target |
|---|---|
| **API** | Render (web service) |
| **Database** | Neon Postgres |
| **Mobile** | EAS Build, with OTA updates via `expo-updates` |
| **Web** | Vercel |

OTA updates download in the background and *offer* a restart — the app never
reloads underneath the user. Release Android builds run R8/ProGuard with
shrinking and obfuscation enabled.

---

<div align="center">

### Read next

**[architecture.md](architecture.md)** — layering, data model, request lifecycle, and the reasoning behind each decision
<br />
**[security.md](security.md)** — auth, sessions, tenancy isolation, hardening, and the known gaps
<br />
**[credentials.md](credentials.md)** — demo accounts for all three roles, and the flows worth trying

</div>
