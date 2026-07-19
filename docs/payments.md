# Payments — Design & Rollout Plan

Status: **design agreed, not yet built.** Supersedes the "Phase 7 mock gateway" note in
`plan.md`. Everything shipped today (`packages/services/dues/payment.service.ts`) is a
mock gateway plus a working offline-receipt flow; this document covers turning that into
real money movement.

---

## 1. What we are building

Three things a resident can pay for, with three different recipients:

| # | What | Recipient | Exists today? |
|---|---|---|---|
| 1 | Monthly maintenance due | The society | `MaintenanceDue` ✅ |
| 2 | Amenity booking (when chargeable) | The society | `Amenity.pricePerSlot` ✅, no payment link ❌ |
| 3 | Service bill (maid, electrician, plumber…) | The individual service person | Nothing — no bill model at all ❌ |

And three **rails** the money can travel on. All three stay — this is deliberate, not a
migration path:

| Rail | `PaymentMethod` | Who it's for | Verification |
|---|---|---|---|
| **Gateway (Razorpay Route)** | `UPI` / `CARD` / `NETBANKING` | Societies | Automatic (webhook) |
| **UPI direct** | `UPI_DIRECT` *(new)* | Anyone who supplies a VPA — optional | Manual (UTR + approval) |
| **Offline** | `OFFLINE` | Cash / cheque / bank transfer | Manual (receipt + approval) |

A society or service person with **no** VPA and **no** linked account still works — they
fall back to offline. Nothing about payments is mandatory to onboard.

### The constraint that drives the whole design

Money must **never** land in our bank account. Pooling other people's funds makes us a
Payment Aggregator under RBI rules, which needs a licence we will not have. So:

- Gateway rail uses **Razorpay Route** — Razorpay settles directly to the recipient's
  linked account. We never take custody.
- UPI-direct and offline rails are **peer-to-peer** — we are a ledger, not a conduit.

Every design decision below follows from this.

---

## 2. Assumptions to confirm before building

1. **"Take the UPI id of the user" = the *recipient's* VPA** (society's, service person's),
   stored optionally. A payer's own VPA is not useful to us and we won't store it. ← confirm
2. Service bills are **resident-initiated** ("I owe ₹500 to Ramesh for this month") rather
   than raised by the service person, because `ServiceProvider` has no login (see §5.3).
3. No part-payment of maintenance dues in v1 (see edge case E13).
4. INR only.

---

## 3. Schema changes

### 3.1 The polymorphic payment problem

`Payment.dueId` is a **non-null FK to `MaintenanceDue`**. Amenity bookings and service
bills are not dues, so this blocks everything.

Three options considered:

| Option | Verdict |
|---|---|
| (a) Three nullable FKs + a DB `CHECK` that exactly one is set | **Chosen** — keeps referential integrity, Prisma-friendly, one payment pipeline |
| (b) `targetType` enum + opaque `targetId` string | Rejected — no FK integrity, no cascade, joins become manual |
| (c) A separate payments table per target | Rejected — triples the state machine, webhook handler, and admin queue |

```prisma
model Payment {
  dueId         String?          // was: String (non-null)
  bookingId     String?
  serviceBillId String?
  // exactly one of the three is non-null — enforced by CHECK constraint
}
```

Prisma can't express `CHECK`, so it goes in the migration as raw SQL:

```sql
ALTER TABLE "Payment" ADD CONSTRAINT "payment_exactly_one_target" CHECK (
  (("dueId" IS NOT NULL)::int + ("bookingId" IS NOT NULL)::int
   + ("serviceBillId" IS NOT NULL)::int) = 1
);
```

**Migration safety:** widening `dueId` from non-null to nullable is backwards-compatible —
every existing row already has a `dueId`, so the CHECK passes on day one. No data
backfill needed.

### 3.2 New and changed models

```prisma
enum PaymentMethod {
  UPI            // gateway
  CARD           // gateway
  NETBANKING     // gateway
  UPI_DIRECT     // NEW — peer-to-peer UPI, manual verification
  OFFLINE        // cash/cheque/transfer, manual verification
}

enum PayoutOnboardingStatus {   // NEW
  NOT_STARTED
  CREATED          // linked account created, KYC pending
  ACTIVE           // KYC done, penny-test passed, can receive
  SUSPENDED
}

model Society {
  upiVpa                 String?                 // NEW — optional
  razorpayAccountId      String?  @unique        // NEW — acc_xxx
  payoutStatus           PayoutOnboardingStatus  @default(NOT_STARTED)  // NEW
}

model ServiceProvider {
  upiVpa String?   // NEW — optional; no linked account, see §5.3
}

model Amenity {
  // pricePerSlot already exists
  cancellationHours Int @default(24)   // NEW — free-cancellation window
}

model AmenityBooking {
  amountDue Decimal? @db.Decimal(10, 2)   // NEW — price snapshot at booking time
  payments  Payment[]                      // NEW
}

enum BookingStatus {
  PENDING_PAYMENT   // NEW — slot held, awaiting payment
  BOOKED
  CANCELLED
  EXPIRED           // NEW — hold lapsed, slot released
  COMPLETED
}

model ServiceBill {                        // NEW
  id                String   @id @default(cuid())
  serviceProviderId String
  residentId        String
  amount            Decimal  @db.Decimal(10, 2)
  description       String?
  periodLabel       String?     // "July 2026"
  status            DueStatus   @default(PENDING)
  createdAt         DateTime    @default(now())
  payments          Payment[]
}

model WebhookEvent {                       // NEW — gateway replay protection
  id         String   @id            // provider's own event id
  provider   String
  receivedAt DateTime @default(now())
}
```

---

## 4. Problems, solutions, and edge cases

### 4.1 Regulatory & Razorpay platform

**P1 — We must not hold funds.**
→ Razorpay Route with transfers declared at order creation. Funds route to the linked
account without touching our balance.

**P2 — Linked-account KYC cannot be absorbed on the recipient's behalf.**
`POST /v2/accounts` takes email, phone, `legal_business_name`, `business_type`, `profile`
(category/subcategory/registered address), and optionally `legal_info` (PAN/GST). It does
**not** take bank details. Razorpay's docs are explicit that the account holder or an
authorised representative completes the KYC form themselves — business details *and* bank
account (number, IFSC, beneficiary name) — after which Razorpay penny-tests the account.
→ We pre-fill everything we can from the `Society` record via API, then hand the admin a
Razorpay-hosted KYC link. Our UI tracks `payoutStatus` and explains what's outstanding.
This is a compliance boundary; no amount of engineering removes the last leg.
→ Put our `societyId` in Razorpay's `reference_id` field: durable two-way mapping and a
natural idempotency handle so a retried create can't orphan an account.

**P3 — Docs contradict each other on activation timing.** One page says a linked account
activates immediately; the transfers page states a mandatory **24-hour cooling period**
before transfers.
→ Verify in test mode before building the UI. Assume 24h and design the onboarding screen
to show a "pending activation" state; if it turns out to be instant, the state is harmless.

**P4 — Linked-account settlements take 2 working days regardless of our settlement
schedule.** Admins will ask where their money is on day one.
→ Show expected credit date on every gateway payment in the admin view. Do not describe a
successful payment as "settled".

**P5 — Payment captured but transfer failed.** Razorpay auto-retries 3× then gives up —
at which point the money is sitting in *our* balance. That is exactly the custody we're
avoiding.
→ Listen for transfer failure, alert loudly (this is an ops incident, not a user error),
and use a **Direct Transfer** to settle it manually. Track it: a `Payment` whose payment
succeeded but whose transfer didn't is a distinct state the admin queue must surface.

### 4.2 Gateway integration mechanics

**E6 — Abandoned checkout leaves `INITIATED` rows forever.**
→ TTL sweep (reuse the existing periodic sweep that flips dues to `OVERDUE`): `INITIATED`
older than 30 min → `FAILED`. For amenity bookings this also releases the slot hold.

**E7 — Razorpay's webhook signature scheme differs from ours.** Ours is a custom HMAC over
`event:paymentId:transactionId`; Razorpay signs the **raw request body** with the webhook
secret and sends `X-Razorpay-Signature`.
→ Keep both, dispatched on provider. The MOCK scheme stays so the existing 144 tests and
local dev keep working without Razorpay credentials.

**E8 — Signature verification needs the raw body.** If the JSON body parser runs first, the
re-serialised body won't match the signature and every webhook will fail.
→ Register a raw-body capture on the webhook route specifically, before parsing. This is
the single most common way this integration breaks.

**E9 — Razorpay retries webhooks.** Our current idempotency infers "already processed"
from payment status, which is fragile once one payment can receive several event types.
→ Add the `WebhookEvent` table keyed on the provider's event id; insert-or-ignore at the
top of the handler and no-op on conflict.

**E10 — Event ordering is not guaranteed.** `transfer.processed` can arrive before
`payment.captured`.
→ Handlers must be order-independent: each event updates only its own field and derives
status from what's present, rather than assuming a prior event landed.

**E11 — Amount units.** Razorpay speaks **integer paise**; we store `Decimal(10,2)`.
→ Convert at the boundary only (`Math.round(amount * 100)`), never store paise, never let
a float into the middle of the calculation.

**E12 — Fees.** Route fees plus any platform fee come out of somewhere. If the transfer
amount is computed naively it can exceed the captured payment and fail.
→ Decide explicitly who bears fees (recommend: the society, deducted from the transfer)
and compute `transferAmount = capturedAmount − fees` in one place with tests.

**E13 — `partial_payment` is incompatible with transfers-via-orders.** So no part-payment
of a maintenance due on the gateway rail.
→ Accept for v1; residents wanting to part-pay use the offline rail. Revisit later.

**E14 — Resident tries to pay a society whose linked account isn't ACTIVE.**
→ Gateway rail is hidden unless `payoutStatus === ACTIVE`. UPI-direct / offline remain.

### 4.3 UPI-direct rail

**E15 — A typo'd VPA sends money to a stranger, irreversibly.** We cannot verify a VPA
without a gateway API call.
→ Format-validate; require the VPA to be entered twice on save; make it admin-only to
edit; and surface the payee name that the UPI app resolves so the payer sees who they're
paying before confirming. Log every VPA change with who made it.

**E16 — A user-typed UTR is not proof of payment.** Same trust level as an uploaded
receipt.
→ `UPI_DIRECT` payments go to `PENDING_VERIFICATION`, never straight to `SUCCESS`. The
target stays payable until a human approves. This reuses the offline machinery exactly.

**E17 — Amount can be edited inside some UPI apps** after the deep link pre-fills it.
→ Another reason verification is mandatory. The approver sees the expected amount next to
the claimed one.

**E18 — Deep links behave differently per platform.** `upi://pay?pa=…&pn=…&am=…&tn=…&cu=INR`
works well on Android; iOS has no universal handler.
→ Android: intent link. iOS: app-specific schemes with a chooser, falling back to a **QR
code + copyable VPA**. The QR fallback also covers the admin web portal.

### 4.4 Amenity bookings

**E19 — Two residents pay for the same slot simultaneously.** Reserving on payment success
means one of them pays for a slot they can't have.
→ Reserve at *order creation*: booking row created `PENDING_PAYMENT` inside the existing
overlap-check transaction, holding the slot. Payment success → `BOOKED`. Expiry (15 min)
or failure → `EXPIRED`, slot released. The existing overlap check must treat
`PENDING_PAYMENT` as occupying the slot.

**E20 — Held slots must actually be released.** Same sweep as E6.

**E21 — Cancellation after payment needs a refund path, and money already transferred to
the society is hard to claw back.**
→ Use Route's **on-hold transfer**: hold until the booking date passes, then release.
Cancellation inside the window is then a simple reversal of an unsettled transfer rather
than a clawback from a society's settled balance. `Amenity.cancellationHours` defines the
free-cancellation window; outside it, no refund.

**E22 — Free amenities must not break.** `pricePerSlot == null` bypasses payment entirely
and books directly, exactly as today.

**E23 — Price changes between booking and payment.**
→ Snapshot into `AmenityBooking.amountDue` at creation; never re-read `pricePerSlot` when
charging.

### 4.5 Service bills

**E24 — `ServiceProvider` has no `User`.** It's a directory row created by an admin
(`addedByAdminId`). A service person cannot log in, so they cannot raise a bill, cannot
confirm a payment, and cannot complete Razorpay KYC.
→ This is why service bills are **UPI-direct / offline only**, never gateway. It's also
why bills are resident-initiated.
→ Verification: the service person can't approve, so a **society admin** approves service-
bill payments, same queue as offline receipts. Alternative considered and rejected for
v1: issuing service persons a login (large scope — auth, onboarding, a whole new role).

**E25 — Service person has no VPA.** Very common.
→ Then only the offline rail shows. The bill still exists as a record. This is why VPA is
optional.

### 4.6 Cross-cutting

**E26 — Double payment.** A resident pays offline *and* via gateway for the same target.
→ Generalise the existing guard: at most one non-terminal payment
(`INITIATED` / `PENDING_VERIFICATION`) per target at a time. Enforce in the same
transaction as creation.

**E27 — No refund flow exists anywhere.** Out of scope for v1 beyond the booking
cancellation path in E21; flagged so it isn't discovered late.

**E28 — Test vs live credentials.** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET` per environment; the existing `PAYMENT_WEBHOOK_SECRET` stays for
the MOCK provider.

**E29 — Existing tests must keep passing.** The MOCK provider is not deleted; it becomes
one implementation behind the provider interface and remains the default when Razorpay
env vars are absent (mirroring how Cloudinary degrades in local dev).

**E30 — Notifications.** New `NotificationType` values for: service bill raised, booking
payment expired, payout onboarding completed, transfer failed (admin-only).

---

## 5. Build order

Each step is independently shippable and leaves the app working.

### Phase 7a — Foundations, no gateway ✅ **built 2026-07-19**
1. ✅ Schema: polymorphic `Payment` + CHECK constraint, `ServiceBill`, `WebhookEvent`,
   optional `upiVpa` on `Society` + `ServiceProvider`, `PaymentMethod.UPI_DIRECT`.
   *(Migration `20260719120000`. The three new FKs are pinned `onDelete: Restrict` —
   Prisma defaults an optional FK to `SET NULL`, which would null the only target and
   violate the CHECK.)*
2. ✅ `payment-target.ts` — target abstraction (resolve/settle/revert/in-flight guard);
   `payment.service.ts` refactored onto it. One-payment-in-flight guard is now per target
   and runs inside the insert transaction (E26).
3. ✅ UPI-direct rail: `upi.ts` (VPA validation, intent/QR payload), `payment.upiIntent`,
   `payment.submitUpiDirect` → `PENDING_VERIFICATION`, reusing the admin queue. VPA is
   admin-only to set, on both `Society` and `ServiceProvider`.
4. ✅ Service bills: `service-bill.service.ts` + `/v1/service-bills`. Resident-raised,
   self-attested, admin-reversible (`payment.reverseService`).
5. ✅ Tests: `payment-rails.test.ts` — 24 tests covering rail eligibility, UPI-direct
   verification, self-attest + reversal, service-bill scoping, CHECK enforcement (zero and
   two targets), cross-rail in-flight guard, history filtering. **Suite: 240 green.**

**Ships:** working payments for all three targets, no gateway, no KYC, no fees.

Deviation worth noting: `paymentOptions` (`GET /v1/payments/options`) was added beyond the
original plan. Without it the client would have to infer which rails are open from society
and provider fields, and would inevitably offer a method that 412s on submission.

### Phase 7b — Amenity booking payments ✅ **built 2026-07-19**
6. ✅ `PENDING_PAYMENT` hold created inside the existing overlap transaction, `amountDue`
   price snapshot, 15-minute `holdExpiresAt`, `expireLapsedHolds()` wired into the api's
   periodic sweep, free amenities (`pricePerSlot == null`) book outright as before.
   Cancellation now covers holds too, and enforces `Amenity.cancellationHours` on paid
   bookings.
7. ✅ Tests (`amenity/booking-payment.test.ts`, 12): a held slot blocks a second resident
   (identical *and* overlapping), price snapshot survives a later price change, rejection
   releases the slot, sweep expires lapsed holds, and a lapsed-but-unswept hold does not
   block a new booking — a resident should not have to wait for the once-a-minute sweep.

### Phase 7c — Razorpay Route ⚠️ **built, blocked on Route enablement**
8. ✅ `razorpay.ts` behind an `isConfigured()` check; MOCK remains the default and is what
   runs with no credentials.
9. ✅ `payout.service.ts` — linked-account create with `reference_id = societyId`, KYC
   link, `payoutStatus` tracking, `refreshPayoutStatus` escape hatch for missed webhooks.
   Routes at `/v1/payouts/{status,start,refresh}`.
10. ✅ Transfers-via-orders; `on_hold: true` for bookings (E21).
11. ✅ `POST /webhooks/razorpay` as a **raw Express route registered before
    `express.json()`** — Razorpay signs the raw bytes, and a parsed-then-reserialised body
    fails every check (E8). `WebhookEvent` dedupe on Razorpay's own event id; handlers are
    order-independent.
12. ✅ `reportTransferFailure` — logs at error and notifies admins; the money is then moved
    by hand with a Direct Transfer.
13. ✅ Tests (`dues/payout.test.ts`, 18): paise rounding (incl. the `19.99` float-drift
    case), fee arithmetic and its never-exceed-captured clamp, account-state mapping
    (unknown states never map to ACTIVE), signature verification incl. the
    re-serialised-body case.

**Live test-mode verification (2026-07-19):**

| Check | Result |
|---|---|
| Auth against Razorpay test API | ✅ plain order created, `order_TF79QjJuPmRXVZ`, 200000 paise |
| `GET /v2/accounts` | ❌ 404 |
| `POST /v2/accounts` (our exact payload) | ❌ 400 — **"Route feature not enabled for the merchant"** |

**The credentials work; Route itself is not switched on.** It is not a self-serve toggle —
it has to be requested from Razorpay support against the merchant account. Until then the
gateway rail cannot be exercised end to end, and `paymentOptions` correctly reports
`gateway: false` for every society, leaving UPI-direct and offline. Nothing is broken; the
code path is simply unreachable.

Still unverified against a live account, and only verifiable once Route is on:
the 24-hour cooling period (P3), real webhook deliveries, and whether transfers-via-orders
behaves as documented for our payload.

---

## 6. Decisions (settled 2026-07-19)

- **Gateway fees: the society bears them** (E12). Deducted from the Route transfer, so the
  resident is charged exactly the due amount and the number on screen is the number
  charged. Fee arithmetic lives in one function so it can flip later.
- **No platform fee** for now. Route transfers the full amount minus Razorpay's own fees.
  Adding one later is a config change, not a rebuild.
- **Service bills: resident self-attests, admin can dispute** (E24). Submitting a UTR marks
  the bill paid immediately — no queue, no admin bottleneck. Admins see every self-attested
  payment in a log and can reverse one, which moves the bill back to payable and notifies
  the resident. Rationale: a society admin genuinely does not know whether a resident paid
  their maid, so gating on their approval would be theatre; but an unreversible unverified
  ledger has no recourse when it's wrong.
- **No part-payment of dues in v1** (E13). Keeps transfers-via-orders and its automatic
  on-capture transfer. Residents needing to part-pay use the offline rail.

---

## References

- [Transfer funds to linked accounts](https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts/)
- [Create a linked account](https://razorpay.com/docs/api/payments/route/create-linked-account/)
- [Linked accounts overview](https://razorpay.com/docs/payments/route/linked-account/)
- [Account APIs](https://razorpay.com/docs/api/partners/account-onboarding/)
