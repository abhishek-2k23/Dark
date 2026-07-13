# Portl — Auth Flows

Canonical reference for how authentication works across the backend and the
mobile app. Code lives in `packages/auth` (primitives), `packages/services`
(flow logic), and `packages/trpc/server/routes/auth` (endpoints).

## Roles & permission levels

Roles are stored as a Prisma enum; authorization uses **numeric permission
levels with breathable gaps** so future roles can slot in without renumbering:

| Role | Level |
|---|---|
| `RESIDENT` | 100 |
| `GUARD` | 200 |
| `ADMIN` | 300 |

Gaps leave room for e.g. a `COMMITTEE_MEMBER` at 250 or `SUPER_ADMIN` at 400.
The level is embedded in the access-token JWT (`level` claim) and exposed via
`PermissionLevel` / `hasMinPermission` in `@repo/auth`.

Two kinds of guards exist in `packages/trpc/server/trpc.ts`:

- `residentProcedure` / `guardProcedure` / `adminProcedure` — **exact-role**
  checks, for endpoints tied to one role's own data (a resident approving
  their visitor; a guard registering an entry).
- `withMinPermission(level)` — **hierarchical** check (`user level >= min`),
  for endpoints where a more privileged role may also act.

## Tokens

| Token | Form | Lifetime | Storage |
|---|---|---|---|
| Access token | JWT (`sub`, `role`, `level`) | ~15 min | Client only (secure store); sent as `Authorization: Bearer <token>` |
| Refresh token | Opaque random 384-bit string | ~30 days | Client keeps the raw token; server stores only its SHA-256 in `RefreshToken.tokenHash` |
| Password-reset token | JWT (`purpose=password_reset`, `pwf`) | 30 min | Not stored; `pwf` binds it to the current password hash |

Secret: `JWT_SECRET` env var (HS256).

### Refresh rotation & reuse detection

1. Client calls `POST /api/v1/auth/refresh` with its refresh token.
2. Server looks up the SHA-256 hash. Valid + unrevoked + unexpired → the old
   row is revoked (`revokedAt` set) and a **new** access + refresh pair is
   issued.
3. If the presented token was **already revoked**, that means it was used
   twice — either a replayed request or a stolen token. The server revokes
   **every** active session for that user and returns 401. The legitimate
   client re-authenticates with password/Google.

`logout` revokes the one presented token; `logout-all` (authenticated)
revokes every active token for the user.

## Signup (email/phone + password)

Self-signup is **invite-gated**: only people a society admin has pre-added
(`PendingResidentInvite`) can create accounts. Admin/guard accounts are
created directly by an admin (Phase 4 `staffAccount.create`), never by
self-signup.

1. Input: `name`, `email` and/or `phone`, `password` (min 8). At least one
   identifier is required (schema can't express this; the service rejects
   with 400).
2. Reject 409 if a user already exists with that email/phone.
3. Find the newest `PENDING` invite matching email or phone. None → 403
   ("ask your society admin to add you first").
4. Hash password with **argon2id**, create the `User` (role `RESIDENT`,
   `societyId` from the invite) + `ResidentProfile` (flat from the invite),
   and mark the invite `CLAIMED` — all in one transaction.
5. Issue token pair.

## Login (email/phone + password)

1. Resolve `identifier` — try email first, then phone.
2. Unknown user or wrong password → 401 with the same generic message (no
   account enumeration). Google-only account (no password hash) → 401 with a
   hint to use Google sign-in.
3. Deactivated account (`isActive = false`) → 403.
4. Issue token pair.

## Google login

1. Mobile obtains a **Google ID token** on-device (`expo-auth-session` or
   `@react-native-google-signin/google-signin`).
2. `POST /api/v1/auth/google` with the ID token. Server verifies it with
   `google-auth-library` against `GOOGLE_CLIENT_ID` (412 if the env var is
   unset; 401 if the token doesn't verify).
3. Match order:
   - `googleId` matches an existing user → log them in.
   - Email matches a **LOCAL** user → 409 "log in with your password"
     (account linking is a future enhancement).
   - Email matches a `PENDING` invite → create a `GOOGLE` user (no password
     hash) + resident profile, claim the invite, log in.
   - Otherwise → 403 "no invite found for this email".

## Password reset (no OTP)

1. `POST /api/v1/auth/password-reset/request` with an email. Always returns
   success (no enumeration). If the account exists **and** has a password, a
   30-minute reset JWT is issued. **Email delivery is currently stubbed** —
   the token is written to the server log; wire a real mailer before launch.
2. `POST /api/v1/auth/password-reset/confirm` with `token` + `newPassword`.
   The token carries a fingerprint of the password hash it was issued
   against, so it self-invalidates once the password changes (single-use)
   and cannot be replayed. On success every session is revoked.

## Endpoints

All are also exposed as REST via trpc-to-openapi under `/api` (interactive
docs at `/docs`).

| tRPC procedure | REST | Auth |
|---|---|---|
| `auth.signup` | `POST /api/v1/auth/signup` | public |
| `auth.login` | `POST /api/v1/auth/login` | public |
| `auth.googleLogin` | `POST /api/v1/auth/google` | public |
| `auth.refresh` | `POST /api/v1/auth/refresh` | public (refresh token in body) |
| `auth.logout` | `POST /api/v1/auth/logout` | public (refresh token in body) |
| `auth.logoutAll` | `POST /api/v1/auth/logout-all` | bearer |
| `auth.me` | `GET /api/v1/auth/me` | bearer |
| `auth.requestPasswordReset` | `POST /api/v1/auth/password-reset/request` | public |
| `auth.resetPassword` | `POST /api/v1/auth/password-reset/confirm` | public |

## Mobile-side contract (Phase 11/12)

- Persist both tokens in `expo-secure-store`; mirror the session into
  `useAuthStore` on launch.
- On a 401 from any call, attempt one `auth.refresh`; on success retry the
  original call, on failure clear the session and route to login.
- After login/refresh, always **replace** the stored refresh token — the old
  one is dead (rotation).
