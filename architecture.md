# Architecture

How Prangan is put together, and why. This document covers the shape of the
system; [security.md](security.md) covers how it defends itself.

---

## 1. The one-directional rule

Everything follows from a single constraint:

```
tRPC route  →  service  →  Prisma  →  Postgres
```

- A **route** validates input, checks the caller's role, and calls a service. It
  never touches Prisma.
- A **service** owns the business rule. It takes the acting `User` as its first
  argument, scopes every query to that user's society, and throws `TRPCError`
  directly. It knows nothing about HTTP.
- **Prisma** is reached only from services.

The payoff is testability. Because a service is a plain async function taking a
`User`, the 334 service tests call business logic directly against a real
database with no server running. And because routes are thin, the permission
suite can call every procedure as every role and assert the middleware rejects
before a handler ever executes.

The cost is a rule you have to keep: a route that reaches for Prisma "just this
once" breaks the property that makes the tests meaningful.

---

## 2. Why tRPC *and* OpenAPI

The mobile app and the API are one TypeScript project, so a hand-written API
contract would be duplicated truth. tRPC removes it: `ServerRouter` is imported
as a type by the app, and a renamed field is a compile error rather than a
runtime surprise.

But a typed transport is only usable from TypeScript. `trpc-to-openapi` reads
the same routers and generates a REST surface — 98 paths, 116 operations —
documented with Scalar. So the project gets end-to-end types *and* an API any
client or reviewer can explore.

Two consequences of running both surfaces:

- **superjson is enabled on `/trpc` only.** `trpc-to-openapi` ignores
  transformers, so REST stays plain JSON. Mobile clients must configure
  `transformer: superjson`.
- **`errorFormatter` serves both.** It attaches `data.fieldErrors` for Zod
  failures and strips stack traces — tRPC only strips them when
  `NODE_ENV === "production"`, and this project uses `"prod"`.

---

## 3. Data model

**34 models, 26 enums, 19 migrations.** The spine is a hierarchy:

```
Society ─┬─ Tower ── Flat ─┬─ ResidentProfile ─┬─ FamilyMember
         │                 │                   └─ Vehicle
         │                 ├─ Visitor
         │                 └─ MaintenanceDue
         ├─ User ─┬─ ResidentProfile / GuardProfile / AdminProfile
         │        └─ RefreshToken, EmailOtp, PushToken, Notification
         ├─ Notice, Poll ── PollOption ── PollVote
         ├─ Amenity ── AmenityBooking
         ├─ HelpdeskTicket ── TicketComment
         ├─ ServiceProvider, EmergencyAlert
         └─ SocietyJoinRequest, PendingResidentInvite
```

Three modelling decisions worth stating, because they surface in the UI:

**Visitors and dues belong to a Flat, not a person.** A flat with two residents
shows both of them the same visitor log and the same dues. That is the truth of
the data, and the resident-detail screen says so explicitly rather than
pretending otherwise.

**A `User` has at most one role profile.** `ResidentProfile`, `GuardProfile` and
`AdminProfile` are separate tables rather than nullable columns on `User`,
because they carry genuinely different fields (flat link, gate assignment,
committee designation).

**A flat has one primary resident.** `ResidentProfile.isPrimaryResident` marks
who owns the flat; the invite picker greys out flats that already have one, and
bulk import rejects rows targeting them. Additional residents are representable
in the schema but no admin flow creates them today.

---

## 4. Request lifecycle

A resident approving a visitor, end to end:

1. **Transport** — the app calls `visitor.approve` over `/trpc`. `authFetch`
   attaches the access token; on a 401 it runs a single token refresh and
   retries, except on `auth.*` routes where a retry would loop.
2. **Context** — the server parses the bearer token, loads the `User`, and
   re-checks `isActive` on every request. Deactivating an account therefore takes
   effect immediately, not when the token expires.
3. **Procedure** — `residentProcedure` asserts the role. Anything below this line
   can assume an authenticated resident.
4. **Validation** — Zod parses the input; failures return `fieldErrors`.
5. **Service** — `visitor.service` resolves the caller's flat, asserts the
   visitor belongs to it, checks the state machine allows `PENDING → APPROVED`,
   and writes.
6. **Notification** — the guard is pushed a message. Fan-out is best-effort and
   **never throws**: a failed push must not fail an approval that already
   happened.
7. **Response** — the app invalidates its `visitor.*` queries and re-renders.

---

## 5. Mobile app structure

`apps/portal` — 63 screens under `expo-router`'s file-based routing.

```
src/app/
  (auth)/       login, signup, OTP, forgot password, society registration
  (resident)/   (tabs) home · visitors · community · payments · profile
                + visitors, tickets, amenities, notices, polls, family, vehicles
  (guard)/      (tabs) home · log · profile  + register, verify
  (admin)/      (tabs) home · manage · community · profile
                + residents, staff, towers, notices, polls, amenities, reports…
```

Each role group is guarded by a `RoleStack`, and the launch gate at `app/index`
routes by role once the session hydrates.

**State has exactly two homes.** Server data lives in the react-query cache and
is never copied into Zustand; Zustand holds the session, UI state (toasts,
dialogs) and ephemeral form state. This is enforced by convention, and it is why
there is no cache-invalidation logic scattered through components.

**The design system** lives in `components/ui`. Cards are "fake glass" — a
translucent fill plus a luminous hairline over an animated aurora backdrop —
rather than real blur, because a real `BlurView` re-renders its backdrop every
frame. Blur is reserved for navigation chrome and, on iOS only, cards that opt
in. Themes are CSS variables surfaced to Tailwind, so `bg-surface` flips between
light and dark without a single conditional.

---

## 6. Background work

The API runs one sweep loop (every 60s) rather than a job queue, because every
task is a cheap `updateMany` over an indexed column:

- expire stale `PENDING` visitors
- expire lapsed guest passes
- expire lapsed join requests
- mark overdue dues

On the device, ambient work is gated rather than constant: the aurora animation
pauses when the app is backgrounded or its screen is not the focused route, and
the shake-detector's accelerometer subscription is released whenever the app
leaves the foreground. Both were previously running unconditionally, which is a
battery cost that buys nothing when nobody is looking.

---

## 7. Notable engineering decisions

| Decision | Reason |
|---|---|
| Opaque refresh tokens, not JWTs | They must be revocable. Stored as SHA-256 hashes, rotated on use, with reuse detection that revokes the whole family |
| Services throw `TRPCError` | One error vocabulary from the database to the client; no mapping layer |
| Cursor pagination (`{items, nextCursor}`) | Stable under insertion, unlike offsets |
| Enum status filters, not booleans | Query params coerce `"false"` to `true`; `ACTIVE/INACTIVE/ALL` cannot be misread |
| Idempotent monthly due generation | `createMany({skipDuplicates})` on a unique `(flatId, month, year)` — running twice is safe |
| Offline payment leaves the due payable | An uploaded receipt is a claim; only admin verification settles it |
| Webhook rejects `OFFLINE` even when signed | Otherwise a forged webhook could self-approve a receipt |
| Push fan-out never throws | A notification failure must not roll back the thing being notified about |
| PDFs render on-device | No server-side rendering dependency; the report is built where the data already is |

---

## 8. Testing strategy

Three layers, each catching what the others cannot:

- **Service tests (334)** — real Postgres, real transactions, real constraints.
  They catch the things mocks hide: unique-violation shapes, cascade behaviour,
  and whether a transaction actually rolls back.
- **Permission tests (15)** — call every procedure as every role with fake users
  and assert the middleware rejects. No database needed, because rejection
  happens before the handler.
- **Unit tests (18)** — pure logic in `@repo/auth` (hashing, JWT, OTP) and
  `@repo/cloudinary` (signing, URL validation).

Plus `tsc --noEmit` across all 8 packages, and an `expo export` bundle check for
the mobile app.

---

## 9. Known limitations

Stated plainly, because a system's edges matter as much as its features:

- **The payment gateway is a mock.** The flow, the states and the signed webhook
  are real; no money moves. Swapping in a real provider means replacing the
  session builder and the signature scheme — the state machine stays.
- **Amenity bookings can't be paid.** `payment.initiate` accepts a booking
  server-side, but no screen exposes the action yet.
- **Flatmates are representable, not creatable.** The schema supports several
  residents per flat and the UI renders them, but no admin flow adds a second.
- **Legacy flats may lack a primary resident.** Flats populated before the
  primary-assignment fix have residents but no owner, so the occupancy rule does
  not apply to them until backfilled.
- **No server-side App Check.** Client attestation was scaffolded and then
  removed, because a token nothing verifies is decoration.
