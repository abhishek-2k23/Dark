<div align="center">

<img src="apps/portal/assets/images/icon.png" alt="Prangan logo" width="112" height="112" />

# **Prangan**

### *Where the gate meets the community*

**A multi-tenant society management platform** — one system for the guard at the
gate, the resident on their phone, and the committee running the place.

<br />

![Expo](https://img.shields.io/badge/Expo-SDK%2056-000020?style=flat-square&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![tRPC](https://img.shields.io/badge/tRPC-end--to--end%20types-2596BE?style=flat-square&logo=trpc&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-live%20billing-0C2451?style=flat-square&logo=razorpay&logoColor=white)
<br />
![Tests](https://img.shields.io/badge/tests-367%20passing-3FB950?style=flat-square)
![API](https://img.shields.io/badge/API-98%20paths%20·%20116%20operations-8250DF?style=flat-square)
![Screens](https://img.shields.io/badge/mobile-63%20screens-1F6FEB?style=flat-square)
![i18n](https://img.shields.io/badge/i18n-English%20·%20हिन्दी-F59E0B?style=flat-square)

<br />

### [**⬇️ Download the Android APK**](https://drive.google.com/file/d/1VzHX6vyNyrn8oMjrNQg2rruJ76uYpptM/view?usp=drive_link)

**[🌐 Live API](https://dark-9k8o.onrender.com/health)** · **[📖 API docs](https://dark-9k8o.onrender.com/docs)** · **[📄 OpenAPI spec](https://dark-9k8o.onrender.com/openapi.json)**

**[Architecture](architecture.md)** · **[Security](security.md)** · **[Demo logins](credentials.md)**

</div>

---

## Try it in two minutes

1. **[Download the APK](https://drive.google.com/file/d/1VzHX6vyNyrn8oMjrNQg2rruJ76uYpptM/view?usp=drive_link)** and install it (Android will ask you to allow installs from this source).
2. Open the app and log in — **no setup, no local server**. It points at the live
   API by default and the demo societies are already seeded:

   ```
   admin@greenmeadows.test   ·   password123
   ```
3. Log out and back in as `guard@greenmeadows.test` or `ravi@example.test` to see
   the same society from the other two sides.

> [!NOTE]
> The API runs on Render's free tier, so the **first request after an idle period
> takes 30–60 seconds** to wake the container. If the first login seems to hang,
> it is cold-starting — try once more. Every request after that is fast.

---

## The problem

A gated residential community runs on three things that don't talk to each
other: a **paper register** at the gate, a **WhatsApp group** for notices, and a
**treasurer chasing maintenance dues by phone**.

Nobody can answer *who visited flat A-304 last Tuesday*. A notice reaches
whoever happens to scroll. A payment is a screenshot. A complaint is a message
that scrolls away. When something goes wrong at 2am, there is no way to reach
everyone at once.

Prangan replaces all of it with one system, seen from three sides.

| | Role | What they do |
|:--:|---|---|
| 🏠 | **Resident** | Approve visitors from their phone, pre-approve guests with a QR pass, raise complaints, book amenities, pay dues, vote in polls, raise an emergency alarm |
| 🛡️ | **Guard** | Register walk-in visitors, verify guest passes, log entry and exit, see who is expected today |
| ⚙️ | **Admin** | Run the society — towers, flats, residents, staff, notices, polls, dues, offline-payment verification, bulk import, reports |

---

## Contents

**[Features](#feature-catalogue)** · **[Tech stack](#tech-stack)** · **[Architecture](#architecture)** · **[Security](#security)** · **[Mobile craft](#mobile-craft)** · **[Layout](#repository-layout)** · **[Quick start](#quick-start)** · **[API](#the-api)** · **[Testing](#testing)** · **[Deployment](#deployment)** · **[Demo logins](#demo-credentials)** · **[Limitations](#known-limitations)**

---

# Feature catalogue

Every feature below is **implemented, tested and deployed**. Each one states what
it does and *why it exists* — the purpose is the part that matters.

## 🔐 Authentication and onboarding

### Email / phone + password login
Single identifier field accepting either an email address or a 10-digit phone
number, resolved server-side. Passwords hashed with **argon2id**.
> **Purpose.** Residents in Indian societies are reached by phone far more
> reliably than by email — many have no working email at all. Forcing email-only
> login would exclude them, so phone is a first-class identifier rather than a
> profile field.

### Google Sign-In (OAuth 2.0)
Google ID tokens verified **server-side** against Google's published
certificates via `google-auth-library`, never trusted from the client.
> **Purpose.** Removes password friction for the majority who already have a
> Google account on their phone, without weakening the trust boundary — a client
> claiming "I am this Google user" proves nothing until the server checks it.

### Email OTP verification
A password login resolving to an **unverified** email returns an
`OTP_REQUIRED` challenge instead of a session, and emails a **6-digit code**
(SHA-256 hashed at rest, 10-minute expiry, 5 attempts, one live code at a time).
> **Purpose.** An email address is a claim until proven. Verification stops one
> resident registering with another's address, and matters because email is the
> password-reset channel — an unverified address is an account-takeover path.

### Three registration routes
1. **Society self-registration** — a founding admin creates the society and the
   first admin account in one transaction.
2. **Invite-based signup** — an admin invites a resident to a specific flat; the
   invite is claimed automatically when they sign up with that address.
3. **Join requests** — an uninvited resident asks to join by the admin's email;
   the admin approves (assigning a flat) or rejects.

> **Purpose.** Societies onboard differently and all three cases are real: a
> brand-new society with nobody in the system, an admin who already has the
> resident register, and a resident who downloaded the app before anyone invited
> them. Supporting only one would strand the other two.

### Role-based access control (RBAC)
Three roles with **numeric permission levels** — `RESIDENT 100 · GUARD 200 ·
ADMIN 300` — embedded as a `level` claim in the access token, with gaps left
between them.
> **Purpose.** Numeric levels make hierarchical checks (`level >= 200`) possible
> without enumerating roles, and the gaps mean a future `SUPER_ADMIN` or
> `COMMITTEE_MEMBER` slots in without renumbering everything that already ships.

---

## 🚪 Visitor and gate management

### Visitor lifecycle state machine
`PENDING → APPROVED | DENIED`, then **entry only after approval**, and **exit
only after entry**. Every illegal transition is a `409 CONFLICT`, not a silent
no-op.
> **Purpose.** The gate log is the security record of the building. If a guard
> can mark an exit for someone who never entered, the record stops meaning
> anything — so the invariants are enforced in the service layer where nothing
> can route around them.

### Real-time resident approval
A visitor arriving at the gate triggers a push notification to every resident of
that flat, who approves or denies from the dashboard.
> **Purpose.** This is the core loop the whole product exists for. The guard
> shouldn't have to phone the flat, and the resident shouldn't have to be at the
> gate to decide.

### Guest pre-approval with QR passes
A resident pre-approves an expected guest for a time window. The guest receives
a **QR code plus a 6-character alphanumeric fallback code** by email; the guard
scans or types it, and verification admits the guest in one step.
> **Purpose.** For expected guests — a party, a delivery, family visiting — the
> approval round-trip is pure friction. The fallback code exists because
> scanning fails constantly in practice: cracked screens, dark gates, a guest
> whose phone is dead.

### Expected-guests queue with search
Guards see all valid passes for today, searchable by guest name **or** pass code.
> **Purpose.** A guard has exactly one of those two things depending on whether
> the guest speaks first or shows their phone first. Searching by only one would
> be useless half the time.

### Automatic expiry sweeps
A 60-second server loop retires stale `PENDING` visitors, lapsed guest passes,
lapsed join requests and overdue dues.
> **Purpose.** Records that stay pending forever pollute every list and every
> count. A sweep is simpler and more predictable than a job queue for work that
> is just an indexed `updateMany`.

---

## 🧾 Community operations

### Complaints / helpdesk tickets
Categorised tickets with human-readable reference codes (**`TKT-XXXXXX`**,
Crockford alphabet minus ambiguous characters), threaded comments, photo
attachments on both the complaint and its resolution, priority, assignment to
staff, and a status workflow.
> **Purpose.** The reference code is what a resident quotes at the society
> office, so it must be readable aloud without confusion between `I`/`1` and
> `O`/`0`. Resolution photos exist because "it's fixed" is disputed constantly —
> a photo ends the argument.

### Notices with scheduling
Society-wide announcements, categorised, optionally **pinned**, optionally
**scheduled** to publish later, with a banner image.
> **Purpose.** Replaces the WhatsApp group, where notices scroll away in minutes
> and nobody can find last month's water-supply announcement. Scheduling lets a
> committee prepare in advance instead of remembering to post at 7am.

### Polls and voting
Single- or multi-choice polls with configurable rules, live result percentages,
and one vote per resident enforced at the database level.
> **Purpose.** Societies make decisions by vote — a new gate contractor, a
> festival budget. Doing it in a group chat means counting emoji reactions and
> arguing about who voted twice.

### Amenity booking
Bookable facilities (clubhouse, tennis court…) with photos, rules, per-slot
pricing, and **slot-overlap prevention inside a transaction**.
> **Purpose.** Double-booked amenities are the classic society argument. The
> overlap check runs inside the booking transaction specifically so two
> residents tapping at the same moment cannot both win.

### Service provider directory
A vetted list of plumbers, electricians, maids and other help, with categories
and contact details.
> **Purpose.** Every resident asks the group chat for a plumber. The society
> already knows the good ones; this makes that knowledge permanent.

### Emergency alarm
Triggered by **shaking the phone** or a **double-tap SOS** button, confirmed
through a **10-second cancel countdown**, then broadcast to the entire society.
Anyone — resident, guard or admin — can raise it *and* resolve it.
> **Purpose.** A fire or medical emergency has to reach everyone in seconds, and
> the person best placed to sound the all-clear is whoever reached the scene, not
> whoever has admin rights. The countdown and the shake threshold (3 spikes above
> 1.7g within 1.5s) exist because a false alarm that wakes 200 flats is its own
> harm. This is the only notification allowed to override silent mode.

---

## 💰 Dues, payments and billing

### Monthly maintenance dues
Per-flat dues generated for a billing month, **idempotently** — the generator
uses `createMany({ skipDuplicates })` against a unique `(flatId, month, year)`.
> **Purpose.** An admin will click "generate" twice. Idempotency means the second
> click is harmless instead of double-billing an entire society.

### Three payment rails — and no held funds
| Rail | How it works | For |
|---|---|---|
| **UPI-direct** | Resident pays the society's UPI ID and records the UTR | Maintenance dues |
| **Offline receipt** | Resident uploads proof; an admin verifies it | Cash, cheque, bank transfer |
| **Gateway** | State machine + HMAC-signed webhook, retained but inert | Future re-enablement |

> **Purpose — and the most important design decision in the project.** Prangan
> **never takes custody of resident money.** Under RBI's Payment Aggregator
> rules, a platform that collects and settles funds on behalf of others needs a
> PA licence. Rather than pretend otherwise, money moves *directly* from resident
> to society, and the platform records it. The gateway rail is kept wired and
> tested so re-enabling it later is a small change, not a rewrite.

### Offline payment verification queue
A resident submits a receipt image; **the due stays payable** until an admin
approves it. Approval settles the payment and the due in one transaction;
rejection carries a reason and allows resubmission.
> **Purpose.** A receipt is a *claim*, not a payment. Marking the due paid on
> upload would let anyone clear their balance with a screenshot.

### Society subscription billing (live Razorpay)
The SaaS side: societies subscribe to Prangan itself through **real Razorpay
checkout** — order creation against the live API, **HMAC-SHA256 checkout
signature verification**, **webhook signature verification**, and idempotency
through a `WebhookEvent` ledger. `subscribedAdminProcedure` gates
write-operations behind an active subscription.
> **Purpose.** This is the platform's own revenue, where taking money *is* the
> point and no PA question arises — the society is paying us, not each other.
> The webhook ledger exists because payment providers retry aggressively and a
> replayed event must not extend a subscription twice.

### Service bills
Bills raised by individual service people (maid, electrician) to a flat.
> **Purpose.** Extends the record beyond society dues to the payments residents
> actually make most often, without the platform touching that money either.

---

## 📣 Notifications

### Push notifications with an in-app inbox
Expo push for every cross-role event — visitor arrival, approval decision,
ticket status change, new notice, new poll, dues raised, payment verified,
emergency, join request. Persisted as an inbox with unread counts and
role-aware deep links.
> **Purpose.** A push is missable and disappears; the inbox is the durable
> record. Deep links mean tapping a notification lands on the exact ticket or
> visitor rather than the home screen.

### Deliberately silent in the foreground
While the app is open, pushes are shown as **in-app toasts** rather than OS
banners — with emergencies and completed downloads as the two exceptions.
> **Purpose.** A busy evening can produce a dozen pushes at once. Stacking OS
> banners over an app the user is already looking at is noise; the app has a
> better idiom for the same information. Emergencies override because being
> noticed is the entire point.

---

## 🛠️ Admin operations

### Bulk resident import (XLSX / CSV)
Upload a spreadsheet of up to 1000 residents. A **dry-run preview** reports every
row's outcome — ready, skipped, or error with a reason — and can optionally
create missing towers and flats. Nothing is written until the admin confirms.
Fuzzy header matching accepts real-world column names (`Block`, `Wing`,
`Unit No.`, `Mobile`).
> **Purpose.** This is the migration path. A society with 300 flats will not
> invite people one at a time, and without an import they simply never adopt the
> product. The preview exists because a bad import is far worse than no import,
> and headers are fuzzy-matched because nobody's register uses our column names.

### Per-resident detail and reports
A single screen assembling everything about one resident — profile, household,
vehicles, visitor log, complaints, bookings, dues, payments, with totals —
exportable as **PDF or spreadsheet** with a section filter.
> **Purpose.** When a resident disputes a bill or an admin handles a complaint,
> the answer is spread across six screens. The section filter exists because an
> admin exporting a payment dispute does not want twelve pages of visitor log
> attached.

### Visitor log export
The full gate register as a **PDF rendered on-device**, filtered by period.
> **Purpose.** Societies keep physical records and share logs with police or
> auditors. A PDF is the format that survives that conversation.

### Real downloads, not share sheets
Exports are **saved to the device** with a completion notification you can tap to
open the file — separate from a **Share** action.
> **Purpose.** "Download" and "share" are different intentions, and mobile apps
> routinely conflate them. On Android the first save asks once for a folder
> (opening directly in Downloads) and remembers it; on iOS files land in the
> app's Documents directory, exposed through the Files app.

### Property and staff management
Towers, flats (with type and floor), guard and admin accounts with committee
designations, resident activation/deactivation.
> **Purpose.** The society structure has to be modelled before anything else
> works — a visitor belongs to a flat, a flat belongs to a tower.

---

# Tech stack

| Layer | Choice | Why this one |
|---|---|---|
| **Monorepo** | pnpm workspaces + Turborepo | One install, cached task graph across 12 packages |
| **API** | Node · Express · tRPC | End-to-end types shared with the app — no hand-written contracts |
| **REST + docs** | trpc-to-openapi · Scalar | The same routers serve tRPC *and* a documented REST surface |
| **Database** | PostgreSQL · Prisma | Society → tower → flat → resident is inherently relational |
| **Validation** | Zod | One schema validates input, types output, *and* documents the API |
| **Auth** | JWT access + opaque refresh · argon2id | Short-lived access, rotating refresh with reuse detection |
| **Mobile** | Expo SDK 56 · React Native 0.85 | One codebase, both platforms, OTA updates |
| **Navigation** | expo-router | File-based routing with role-scoped stacks |
| **Server state** | @trpc/react-query | Caching, invalidation, background refetch |
| **Client state** | Zustand | Session and UI only — server data is never duplicated |
| **Styling** | NativeWind v4 | Tailwind semantics over CSS-variable theme tokens |
| **Media** | Cloudinary | Signed direct-from-device uploads, no proxying |
| **Payments** | Razorpay | Live for subscriptions; HMAC-verified webhooks |
| **Email** | Nodemailer | OTP, password reset, guest passes, ticket receipts |
| **Testing** | Vitest | 367 tests against a real Postgres |

---

# Architecture

## The one-directional rule

```
tRPC route  →  service  →  Prisma  →  PostgreSQL
```

- A **route** validates input, checks the caller's role, calls a service. It
  never touches Prisma.
- A **service** owns the business rule, takes the acting `User` as its first
  argument, scopes every query to that user's society, and throws `TRPCError`
  directly. It knows nothing about HTTP.
- **Prisma** is reached only from services.

> **Purpose.** Because a service is a plain async function taking a `User`, 334
> tests exercise real business logic against a real database with no server
> running. And because routes are thin, the permission suite can call every
> procedure as every role and assert rejection happens in middleware.

## Why tRPC *and* OpenAPI

The mobile app and the API are one TypeScript project, so a hand-written contract
would be duplicated truth. tRPC removes it — `ServerRouter` is imported as a type
by the app, so a renamed field is a **compile error**, not a runtime surprise.

But a typed transport is only usable from TypeScript. `trpc-to-openapi` reads the
same routers and generates a REST surface — **98 paths, 116 operations** —
rendered by Scalar. Two consequences:

- **superjson runs on `/trpc` only.** `trpc-to-openapi` ignores transformers, so
  REST stays plain JSON.
- **`errorFormatter` serves both surfaces.** It attaches `data.fieldErrors` for
  Zod failures and strips stack traces.

## Data model

**34 models · 26 enums · 19 migrations.**

```
Society ─┬─ Tower ── Flat ─┬─ ResidentProfile ─┬─ FamilyMember
         │                 │                   └─ Vehicle
         │                 ├─ Visitor
         │                 └─ MaintenanceDue
         ├─ User ─┬─ ResidentProfile / GuardProfile / AdminProfile
         │        └─ RefreshToken · EmailOtp · PushToken · Notification
         ├─ Notice · Poll ── PollOption ── PollVote
         ├─ Amenity ── AmenityBooking
         ├─ HelpdeskTicket ── TicketComment
         ├─ ServiceProvider · ServiceBill · EmergencyAlert
         ├─ Subscription · Plan · WebhookEvent
         └─ SocietyJoinRequest · PendingResidentInvite
```

Three decisions that surface directly in the UI:

- **Visitors and dues belong to a `Flat`, not a person.** Flatmates see the same
  visitor log and the same dues. The resident-detail screen says so explicitly
  rather than pretending otherwise.
- **A `User` has at most one role profile**, as separate tables rather than
  nullable columns, because they carry genuinely different fields.
- **A flat has one primary resident.** The invite picker greys out flats that
  already have one; bulk import rejects rows targeting them.

## Request lifecycle

A resident approving a visitor:

1. **Transport** — `authFetch` attaches the access token; a 401 triggers exactly
   one refresh and retry, skipped on `auth.*` routes where retrying would loop.
2. **Context** — the server parses the token, loads the `User`, and re-checks
   `isActive` **on every request**, so deactivation takes effect immediately
   rather than when the token expires.
3. **Procedure** — `residentProcedure` asserts the role.
4. **Validation** — Zod parses input; failures return `fieldErrors`.
5. **Service** — resolves the caller's flat, asserts the visitor belongs to it,
   checks the state machine permits the transition, writes.
6. **Notification** — the guard is pushed. Fan-out is best-effort and **never
   throws**: a failed push must not fail an approval that already happened.
7. **Response** — the app invalidates `visitor.*` queries and re-renders.

## Background work

One 60-second sweep loop rather than a job queue — every task is a cheap
`updateMany` over an indexed column: expire stale visitors, expire lapsed
passes, expire lapsed join requests, mark overdue dues, sweep subscriptions.

## Engineering decisions

| Decision | Reason |
|---|---|
| Opaque refresh tokens, not JWTs | They must be **revocable**; a JWT is valid until it expires whatever the server thinks |
| Services throw `TRPCError` | One error vocabulary from database to client, no mapping layer |
| Cursor pagination `{items, nextCursor}` | Stable under insertion, unlike offsets |
| Enum status filters, not booleans | Query params coerce `"false"` to `true`; `ACTIVE/INACTIVE/ALL` cannot be misread |
| Idempotent due generation | Running it twice is safe |
| Offline payment leaves the due payable | A receipt is a claim, not a payment |
| Webhook rejects `OFFLINE` even when signed | Otherwise a forged webhook self-approves a receipt |
| Push fan-out never throws | A notification failure must not roll back the thing being notified about |
| PDFs render on-device | No server rendering dependency; built where the data already is |

---

# Security

> Full detail in **[security.md](security.md)**. Summary below.

## Authentication
- **argon2id** password hashing — memory-hard, stronger default than bcrypt.
- **Indistinguishable failures.** Wrong password, unknown account and
  Google-only account all return the same error, so the endpoint cannot enumerate
  a society's members.
- **Deactivated accounts are refused at login *and* on every request**, because
  the context re-reads `isActive` rather than trusting the token.

## Sessions
| | |
|---|---|
| **Access token** | JWT · 15 minutes · carries `sub`, `role`, numeric `level` |
| **Refresh token** | **Opaque** random string, SHA-256 hashed at rest |

- **Rotated on every use.**
- **Reuse detection** — presenting an already-rotated token means it was
  captured, so the *entire token family* is revoked and every session dies.
  (This fired during live testing, exactly as designed.)
- Stored on device in **expo-secure-store** (Keychain / EncryptedSharedPreferences);
  the access token is held in memory only.

## Authorization — two layers, both must pass
1. **Role**, at the procedure boundary: `publicProcedure`, `protectedProcedure`,
   `residentProcedure`, `guardProcedure`, `adminProcedure`,
   `subscribedAdminProcedure`.
2. **Tenancy**, inside the service: every query scoped to `actor.societyId`.

> An admin of one society requesting a resident of another gets **`NOT_FOUND`,
> not `FORBIDDEN`** — the difference between "you may not see this" and "this
> does not exist to you". The latter leaks nothing about other tenants.

## Input and transport
- **Zod on input *and* output** — responses are stripped to their declared shape,
  so an accidental over-select cannot leak a `passwordHash`.
- **helmet** headers · **CORS allowlist** · **rate limiting** (10 requests / 15
  minutes on all auth paths, both surfaces) · **`trust proxy = 1`** in production
  so Render's forwarded IPs don't put every user in one bucket.
- Stack traces stripped from all error responses.

## Uploads
Direct device → Cloudinary with a **short-lived server-issued signature scoped to
an upload kind**; the API never proxies bytes. Every stored URL is **validated
against the configured Cloudinary cloud** before it is persisted, so a client
cannot save a link to an attacker-controlled host.

## Privilege boundaries
- **Admins cannot change a resident's email or phone — only fill in a missing
  one.** Overwriting an email would hand any admin a password-reset path into
  that account. Enforced server-side with a 409.
- **Admin-set emails stay unverified**, so the OTP gate still applies.
- **Residents see only their own flat's** visitor history, whatever filter they
  pass.

---

# Mobile craft

Details that don't show up in a feature list but decide whether the app is
pleasant to use.

### Internationalisation — English + हिन्दी
**939 translation keys per locale**, at full parity, covering every string
including enum labels and error messages. Language and theme persist across
launches.
> **Purpose.** The people who most need this app — guards especially — are often
> more comfortable in Hindi than English. A half-translated app is worse than an
> untranslated one, so parity is verified rather than assumed.

### Accessibility
Screen-reader labels on every icon-only control, `accessibilityState` on
toggles, font scaling capped at 1.4×, **Reduce Motion honoured** (ambient
animation stops entirely), and a screen-reader path that bypasses the SOS
double-tap — since VoiceOver and TalkBack spend their own double-tap on
activation and would otherwise be locked out of the panic button.

### Theming
Light and dark, plus **auto**. Semantic tokens are CSS variables surfaced to
Tailwind, so `bg-surface` flips without a single conditional. The visual language
is **glassmorphism** — translucent fills and luminous hairlines over an animated
aurora backdrop.

### Performance and battery
- **Ambient animation is gated**, pausing when the app is backgrounded *or* the
  screen isn't the focused route — React Navigation keeps pushed-under screens
  mounted, so a resident three screens deep would otherwise have four invisible
  backdrops animating.
- **The accelerometer is released** whenever the app leaves the foreground.
- **Cards use "fake glass"** — translucent fill, not `BlurView`, which re-renders
  its backdrop every frame. Real blur is reserved for navigation chrome and
  opt-in iOS cards.
- **Skeleton screens** on first load of every dashboard, shaped like the content
  they stand in for.
- **`inlineRequires`** defers module evaluation to first use, so launch doesn't
  pay for the PDF renderer and spreadsheet parser.

### Offline and resilience
Token refresh with single-retry, network-aware error messages distinguishing
"can't reach the server" from "the server failed", themed in-app dialogs
replacing OS alerts, and an error boundary around the navigator.

---

# Repository layout

```
apps/
  api/        Express host — tRPC at /trpc, REST at /api/v1, docs at /docs
  portal/     Expo mobile app — 63 screens across resident, guard and admin stacks
  web/        Next.js — privacy, help, account deletion (app-store requirements)

packages/
  database/   Prisma schema (34 models · 26 enums · 19 migrations), client, seed
  trpc/       Routers, procedures, Zod models, OpenAPI metadata
  services/   Business logic — 15 domains, the only layer that touches Prisma
  auth/       Password hashing, JWT, OTP helpers, permission levels
  mailer/     Nodemailer templates
  cloudinary/ Upload signing and URL validation
  logger/     Winston
  eslint-config · typescript-config
```

---

# Quick start

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

The app talks to the **deployed** API by default, so you can log in immediately
with the accounts below — no local setup required. To run fully local, set
`EXPO_PUBLIC_API_URL=http://localhost:8000`; on Android emulators `localhost` is
rewritten to `10.0.2.2` automatically.

> [!TIP]
> Start the API through the root `pnpm dev`, not `pnpm --filter @repo/api dev` —
> the latter skips the root dotenv load and Prisma won't connect.

---

# The API

**Base URL — `https://dark-9k8o.onrender.com`**

| Surface | URL | For |
|---|---|---|
| **REST** | `/api/v1/*` | Plain JSON — **98 paths · 116 operations** |
| **Interactive docs** | [`/docs`](https://dark-9k8o.onrender.com/docs) | Scalar UI — browse and call every endpoint |
| **OpenAPI spec** | [`/openapi.json`](https://dark-9k8o.onrender.com/openapi.json) | Machine-readable, OpenAPI 3.0 |
| **Health** | [`/health`](https://dark-9k8o.onrender.com/health) | Liveness probe |
| **tRPC** | `/trpc/*` | The mobile app — typed transport, superjson |

Try it from a terminal — log in and call a protected route:

```sh
API=https://dark-9k8o.onrender.com

TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@greenmeadows.test","password":"password123"}' \
  | jq -r .session.accessToken)

curl -s "$API/api/v1/residents?status=ALL&limit=5" -H "Authorization: Bearer $TOKEN" | jq
```

Committed spec: [`docs/openapi.json`](docs/openapi.json).
[Postman collection](docs/postman-collection.json) — import it, set `baseUrl`,
run **Auth → Log in**, and the token is captured automatically.

## Route reference

All 116 operations, grouped by tag. Paths are relative to `/api/v1`
(except `/health`).

<details>
<summary><b>🔐 Auth</b> — 12 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/signup` | Sign up with email and password (OTP-verified) |
| `POST` | `/auth/login` | Log in with email/phone and password |
| `POST` | `/auth/google` | Log in with a Google ID token |
| `POST` | `/auth/register-society` | Register a new society and its first admin |
| `POST` | `/auth/email-otp/verify` | Confirm an email-verification OTP |
| `POST` | `/auth/email-otp/resend` | Re-send an email-verification OTP |
| `POST` | `/auth/password-reset/request` | Request a password reset email |
| `POST` | `/auth/password-reset/confirm` | Set a new password using a reset token |
| `POST` | `/auth/refresh` | Rotate a refresh token for a new token pair |
| `POST` | `/auth/logout` | Log out (revoke one refresh token) |
| `POST` | `/auth/logout-all` | Log out everywhere (revoke all refresh tokens) |
| `GET` | `/auth/me` | Get the current authenticated user |

</details>

<details>
<summary><b>🏢 Society, residents and staff</b> — 22 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `GET` · `PATCH` | `/society` | Get / update the admin's society |
| `GET` · `POST` | `/towers` | List / create towers |
| `PATCH` | `/towers/{towerId}` | Rename a tower |
| `GET` · `POST` | `/flats` | List / create flats |
| `PATCH` | `/flats/{flatId}` | Update a flat |
| `GET` | `/residents` | List the society's residents |
| `GET` | `/residents/{userId}` | Everything about one resident |
| `POST` | `/residents/invite` | Invite a resident to a flat |
| `PATCH` | `/residents/{userId}/contact` | Fill in a missing email or phone |
| `POST` | `/residents/{userId}/deactivate` | Deactivate a resident |
| `POST` | `/residents/{userId}/reactivate` | Reactivate a resident |
| `POST` | `/residents/import/preview` | Dry-run a bulk import |
| `POST` | `/residents/import` | Commit a bulk import |
| `GET` · `POST` | `/staff` | List / create guard and admin accounts |
| `POST` · `GET` | `/join-requests` | Submit / list join requests |
| `GET` | `/join-requests/mine` | The caller's most recent request |
| `POST` | `/join-requests/decide` | Approve or reject a request |

</details>

<details>
<summary><b>🚪 Visitors and guest passes</b> — 14 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/visitors/register` | Register a visitor at the gate |
| `GET` | `/visitors` | Visitor history (role-aware scope) |
| `GET` | `/visitors/pending` | The caller's pending approvals |
| `GET` | `/visitors/{visitorId}` | One visitor request |
| `POST` | `/visitors/{visitorId}/approve` | Approve a pending visitor |
| `POST` | `/visitors/{visitorId}/deny` | Deny a pending visitor |
| `POST` | `/visitors/{visitorId}/entry` | Mark physical entry |
| `POST` | `/visitors/{visitorId}/exit` | Mark exit |
| `POST` · `GET` | `/pre-approvals` | Create / list guest passes |
| `GET` | `/pre-approvals/gate` | Expected guests at the gate |
| `POST` | `/pre-approvals/verify` | Verify a guest's QR or code |
| `POST` | `/pre-approvals/{id}/cancel` | Cancel an upcoming pass |
| `GET` | `/gate/flats` | Search flats at the gate |

</details>

<details>
<summary><b>💰 Dues, payments and service bills</b> — 15 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dues` | List dues (role-aware scope) |
| `POST` | `/dues/generate` | Generate the month's dues for every flat |
| `GET` | `/payments` | The caller's payment history |
| `GET` | `/payments/options` | Which rails are usable for a target |
| `GET` | `/payments/upi-intent` | UPI deep link / QR payload |
| `POST` | `/payments/upi` | Report a peer-to-peer UPI payment |
| `POST` | `/payments/offline` | Submit a receipt for an offline payment |
| `GET` | `/payments/pending` | Manual payments awaiting verification |
| `POST` | `/payments/decide` | Verify or reject a manual payment |
| `POST` | `/payments/initiate` | Start a gateway payment |
| `POST` | `/payments/webhook` | Gateway webhook (signature-verified) |
| `POST` | `/payments/service/reverse` | Reverse a self-attested service payment |
| `GET` · `POST` | `/service-bills` | List / raise a service bill |
| `DELETE` | `/service-bills/{billId}` | Delete a bill raised in error |

</details>

<details>
<summary><b>🧾 Helpdesk, notices, polls and amenities</b> — 22 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `POST` · `GET` | `/tickets` | Raise / list complaints |
| `GET` | `/tickets/{ticketId}` | A ticket with its comments |
| `POST` | `/tickets/{ticketId}/comments` | Comment on a ticket |
| `POST` | `/tickets/{ticketId}/status` | Change status |
| `POST` | `/tickets/{ticketId}/assign` | Assign to staff |
| `POST` · `GET` | `/notices` | Publish / list notices |
| `PATCH` · `DELETE` | `/notices/{noticeId}` | Update / delete a notice |
| `POST` · `GET` | `/polls` | Create / list polls |
| `POST` | `/polls/{pollId}/vote` | Vote in a poll |
| `GET` | `/polls/{pollId}/results` | Aggregated results |
| `POST` · `GET` | `/amenities` | Create / list amenities |
| `PATCH` · `DELETE` | `/amenities/{amenityId}` | Update / delete an amenity |
| `POST` | `/amenity-bookings` | Book a slot |
| `GET` | `/amenity-bookings/mine` | The caller's bookings |
| `GET` | `/amenity-bookings/calendar` | Admin booking calendar |
| `POST` | `/amenity-bookings/{bookingId}/cancel` | Cancel a booking |

</details>

<details>
<summary><b>🚨 Emergency, notifications and directory</b> — 13 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/emergencies/raise` | Raise a society-wide alarm |
| `GET` | `/emergencies/active` | Live alarms in the society |
| `POST` | `/emergencies/{id}/resolve` | Sound the all-clear |
| `GET` | `/emergencies` | Alarm history |
| `GET` | `/notifications` | The caller's inbox |
| `POST` | `/notifications/{id}/read` | Mark one as read |
| `POST` | `/notifications/read-all` | Mark all as read |
| `POST` | `/push-tokens/register` | Register an Expo push token |
| `POST` | `/push-tokens/unregister` | Remove a push token |
| `POST` · `GET` | `/service-providers` | Add / list the directory |
| `PATCH` · `DELETE` | `/service-providers/{id}` | Update / remove a provider |

</details>

<details>
<summary><b>👤 Profile, uploads, billing and account</b> — 18 operations</summary>

| Method | Path | Purpose |
|---|---|---|
| `GET` · `PATCH` | `/profile/me` | Get / update the caller's profile |
| `POST` | `/family-members` | Add a family member |
| `PATCH` · `DELETE` | `/family-members/{id}` | Update / remove |
| `POST` | `/vehicles` | Register a vehicle |
| `PATCH` · `DELETE` | `/vehicles/{id}` | Update / remove |
| `POST` | `/uploads/signature` | Signature for a direct Cloudinary upload |
| `GET` | `/plans` | List subscription plans |
| `GET` | `/subscription` | Current subscription |
| `POST` | `/subscription/checkout` | Start a plan purchase (Razorpay) |
| `POST` | `/subscription/verify` | Confirm a completed checkout |
| `GET` | `/subscription/payments` | Subscription payment history |
| `POST` | `/subscription/cancel` | Cancel at period end |
| `POST` | `/account/deletion/request` | Request deletion (emails a code) |
| `POST` | `/account/deletion/confirm` | Confirm deletion with the code |
| `GET` | `/health` | Liveness probe *(no `/v1` prefix)* |

</details>

```sh
pnpm openapi:generate   # regenerate after changing a route
```

Every procedure carries `meta.openapi` (method, path, tags, summary, and a
description listing its error cases) plus named Zod schemas with `.describe()` on
each field — which is why the docs read as documentation rather than a type dump.

> [!NOTE]
> `trpc-to-openapi` returns **415** on POST/PATCH/DELETE without
> `Content-Type: application/json`, even for path-only inputs. Send `{}`.

---

# Testing

```sh
pnpm test          # 367 tests
pnpm check-types   # tsc --noEmit across all 8 packages
```

| Suite | Tests | Covers |
|---|--:|---|
| `@repo/services` | 334 | Business logic against **real PostgreSQL** |
| `@repo/trpc` | 15 | Permission matrix — every procedure, every role |
| `@repo/auth` | 10 | Hashing, JWT, OTP |
| `@repo/cloudinary` | 8 | Upload signing, URL validation |

> **Purpose.** Service tests run against a real database rather than mocks, so
> they catch what mocks hide: unique-violation shapes, cascade behaviour, and
> whether a transaction actually rolls back. Fixtures are namespaced per run and
> cleaned up afterwards.

> [!IMPORTANT]
> Anything that sends mail must `vi.mock("@repo/mailer")` — the repo `.env` may
> carry live SMTP credentials.

---

# Deployment

| Piece | Target |
|---|---|
| **API** | Render (web service) |
| **Database** | Neon PostgreSQL |
| **Mobile** | EAS Build · OTA updates via `expo-updates` |
| **Web** | Vercel |

OTA updates download in the background and *offer* a restart — the app never
reloads underneath the user. Release Android builds run **R8/ProGuard** with
shrinking and obfuscation.

---

# Demo credentials

**All password accounts use `password123`.** These exist on the **deployed API**,
so they work without any local setup. Full list in
**[credentials.md](credentials.md)**.

**Start here** — the Green Meadows admin has the richest seeded data:

```
admin@greenmeadows.test  /  password123
```

| Society | Admin | Guard | Resident |
|---|---|---|---|
| **Green Meadows**, Bengaluru | `admin@greenmeadows.test` | `guard@greenmeadows.test` | `ravi@example.test` |
| **Palm Grove**, Pune | `admin@palmgrove.test` | `guard@palmgrove.test` | `sneha@palmgrove.test` |
| **Lakeview Enclave**, Gurugram | `admin@lakeview.test` | `guard@lakeview.test` | `karan@lakeview.test` |

The identifier field accepts the **email or the phone number**. Seeded accounts
skip the OTP step — they're verified, and `.test` addresses are treated as demo
accounts. A real signup with an unverified address *is* OTP-gated.

### Flows worth trying (two roles each)

| To see | Log in as | Then as |
|---|---|---|
| Visitor approval | Guard — register a walk-in | Resident — approve or deny |
| Guest pass | Resident — pre-approve a guest | Guard — verify the code |
| Complaint workflow | Resident — raise a ticket | Admin — assign and resolve |
| Offline payment | Resident — submit a receipt | Admin — verify it in the queue |
| Join request | New signup — request to join | Admin — approve with a flat |

---

# Known limitations

Stated plainly — a system's edges matter as much as its features.

| Limitation | Detail |
|---|---|
| **Resident payments are recorded, not processed** | Deliberate: no PA licence, so no held funds. The gateway rail stays wired and tested for later |
| **Amenity bookings can't be paid in-app** | `payment.initiate` accepts a booking server-side, but no screen exposes the action |
| **Flatmates are representable, not creatable** | The schema supports several residents per flat and the UI renders them; no admin flow adds a second |
| **Legacy flats may lack a primary resident** | Flats populated before the primary-assignment fix need a one-off backfill before the occupancy rule applies to them |
| **No app attestation** | Play Integrity was scaffolded then removed — a client token nothing verifies is decoration. Re-add both halves together |
| **`.test` emails skip OTP** | Demo convenience; remove before a real launch |
| **No audit log** | Sensitive admin actions aren't written to an append-only trail |

---

<div align="center">

**[architecture.md](architecture.md)** — layering, data model, request lifecycle, decisions
<br />
**[security.md](security.md)** — auth, sessions, tenancy isolation, hardening, gaps
<br />
**[credentials.md](credentials.md)** — every demo account, and the flows worth trying

</div>
