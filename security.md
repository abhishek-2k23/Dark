# Security

Prangan holds a residential community's register: who lives where, who visited
whom, and what everyone owes. This document states what protects that, and what
does not.

---

## 1. Passwords and login

- **argon2id** hashing (`@repo/auth`), chosen over bcrypt for memory-hardness.
  A plaintext password is never logged or stored.
- Login accepts an **email or a phone number** in one field and resolves it
  server-side.
- **Failures are indistinguishable.** A wrong password, an unknown account and a
  Google-only account with no password all return the same error, so the
  endpoint cannot be used to enumerate members of a society.
- **Deactivated accounts are refused at login and on every request** — the
  request context re-reads `isActive` rather than trusting the token, so an
  admin deactivating a resident cuts access immediately instead of when the
  access token expires.

## 2. Email verification (OTP)

A password login whose identifier resolves to an **unverified email** does not
return a session. It returns an `OTP_REQUIRED` challenge and emails a 6-digit
code:

- Codes are **SHA-256 hashed at rest** — the database never holds a usable code.
- **10-minute expiry**, **5 attempts**, then `TOO_MANY_REQUESTS`.
- Issuing a new code **consumes every outstanding code** for that purpose, so
  only one is ever live.
- Verification failures are **opaque**: unknown, expired and wrong all return the
  same `UNAUTHORIZED`.
- Timing-safe comparison on the hash.
- Resend is **non-enumerating** — it responds identically whether or not the
  address exists.

Phone logins and verified emails are not gated, by design.

**Known exemption:** addresses ending in `.test` (an RFC 2606 reserved TLD, so
unreachable by a real user) bypass the OTP gate. This exists so demo accounts
work without an inbox. It is deliberate and worth removing before a real launch.

## 3. Sessions

| | |
|---|---|
| **Access token** | JWT, 15 minutes, carries `sub`, `role` and a numeric `level` |
| **Refresh token** | Opaque random string, **not** a JWT |

Refresh tokens are opaque precisely because they must be **revocable** — a
self-contained JWT is valid until it expires, whatever the server thinks.

- Stored **SHA-256 hashed**; a database leak yields no usable token.
- **Rotated on every use** — the old token is revoked as the new one is issued.
- **Reuse detection**: presenting an already-rotated token means it was captured,
  so the entire token family for that user is revoked and every session dies.
  (This fired during live testing, as designed.)
- Deactivation revokes all refresh tokens in the same transaction.
- On device, tokens live in **expo-secure-store** (Keychain / EncryptedSharedPreferences).
  The access token is held in memory only.

## 4. Password reset

The reset token is a JWT **bound to the current password hash**, which makes it
single-use without any server-side state: once the password changes, the hash
changes, and the token no longer validates. Resetting also revokes every refresh
token.

The request endpoint is non-enumerating — it always reports that a link was sent.

## 5. Authorization

Two layers, and both must pass.

**Role, at the procedure boundary.** Roles carry numeric levels with deliberate
gaps (`RESIDENT 100 · GUARD 200 · ADMIN 300`), embedded in the access token.
Procedures are explicit: `publicProcedure`, `protectedProcedure`,
`residentProcedure`, `guardProcedure`, `adminProcedure`, and
`subscribedAdminProcedure` for actions that additionally require an active
subscription.

**Tenancy, inside the service.** Every service takes the acting `User` and scopes
its queries to `actor.societyId`. This is the layer that matters most in a
multi-tenant app: an admin of one society asking for a resident of another gets
**`NOT_FOUND`, not `FORBIDDEN`** — the difference between "you may not see this"
and "this does not exist to you", and the latter leaks nothing about other
societies.

A user with no society link gets `PRECONDITION_FAILED`, never a silent
unscoped query.

**Verified by test.** The tRPC permission suite calls every procedure as every
role and asserts rejection happens in middleware, before any handler runs.

## 6. Input validation

Every procedure declares Zod schemas for input **and** output. Consequences:

- Nothing untyped reaches a service.
- Responses are stripped to their declared shape, so an accidental
  `select: *` cannot leak a `passwordHash` through a response.
- Field-level errors are returned as `data.fieldErrors` on both surfaces.
- Stack traces are stripped from all error responses.

## 7. Transport and platform

- **helmet** security headers (CSP disabled only for the Scalar docs page).
- **CORS** from an `ALLOWED_ORIGINS` allowlist. Wildcard in development;
  unset in production means no CORS headers at all.
- **Rate limiting** on authentication paths — 10 requests / 15 minutes, applied
  to login, signup, Google, society registration, OTP verify/resend and password
  reset, on both the REST and tRPC surfaces. `/refresh` is excluded so a normal
  session cannot be locked out.
- **`trust proxy = 1`** in production. Without it, Render's `X-Forwarded-For`
  meant every user shared one rate-limit bucket.
- **Release Android builds** run R8/ProGuard with shrinking and obfuscation.
- **Optional biometric app-lock** (`expo-local-authentication`) veils the app
  until the owner re-authenticates.

## 8. File uploads

Uploads go **directly from device to Cloudinary**, signed by the server — the
API never proxies file bytes.

- The server issues a **short-lived signature scoped to an upload kind**
  (avatar, visitor, ticket, notice, amenity, receipt, logo), each pinned to its
  own folder and transformation.
- Every stored URL is **validated against the configured Cloudinary cloud** before
  it is written, so a client cannot persist a link to an attacker-controlled
  host.
- 10 MB cap, enforced client-side before upload.

## 9. Payments

- The gateway webhook verifies an **HMAC-SHA256 signature** over
  `event:paymentId:transactionId` using a shared secret, compared **timing-safely**.
  A missing secret returns `PRECONDITION_FAILED` rather than accepting anything.
- Replays are **idempotent**; a conflicting event on a settled payment is a 409.
- **`OFFLINE` payments are rejected by the webhook even with a valid signature.**
  Otherwise a forged webhook could self-approve an uploaded receipt.
- Offline receipts leave the due **payable** until an admin verifies them.

## 10. Privilege boundaries worth calling out

- **Admins cannot change a resident's email or phone — only fill in a missing
  one.** Overwriting an email would hand any admin a password-reset path into
  that resident's account. The server enforces fill-only with a 409, and the UI
  only offers fields that are actually empty.
- **Admin-set emails stay unverified**, so the OTP gate still applies when the
  resident signs in. An admin typing an address is not proof of ownership.
- **Ticket access** is owner / society-admin / assignee. A guard listing tickets
  gets `FORBIDDEN`; a resident who merely owns a ticket cannot change its status.
- **Residents see only their own flat's** visitor history, regardless of any
  filter they pass.

---

## 11. Known gaps

Honest inventory. None of these are unknown-unknowns.

| Gap | Status |
|---|---|
| **No app attestation** | Play Integrity / App Check was scaffolded, then deliberately removed. A client-issued attestation token is worthless until the server verifies it, and that half was never built. Re-add both halves together |
| **`.test` emails skip OTP** | Demo convenience. Remove before a real launch |
| **Mock payment gateway** | No real money moves. The signed-webhook and state machine are real |
| **Email delivery is best-effort** | The OTP is committed before the send, and the send is fire-and-forget with failures logged. A user who never receives mail must use resend |
| **No 2FA for admins** | An admin account is protected by password (+ OTP if their email is unverified) only |
| **No audit log** | Sensitive admin actions — deactivation, payment verification, contact fill — are not recorded to an append-only trail |
| **Secrets in `.env`** | Fine for a hackathon; production wants a managed secret store |

---

## 12. Reporting

This is a hackathon project and not handling real residents' data. If you find
something, open an issue — or, for anything exploitable, contact the maintainer
directly rather than filing publicly.
