# Portl — Dev Login Credentials

Seeded by `packages/database/seed.ts` ("Portl Communities" — 3 sample societies).
**All LOCAL accounts share the password `password123`.**

> ⚠️ **Which backend has these accounts?**
> The mobile app (`apps/portal`) defaults to the **deployed Render API**
> (`https://dark-9k8o.onrender.com`, backed by Neon). Running `pnpm db:seed`
> only populates the **local** docker Postgres. So a freshly-seeded account works
> against whichever database you seeded:
> - **Local backend** → seed local (`pnpm --filter @repo/database db:seed`) **and**
>   point the app at it: `EXPO_PUBLIC_API_URL=http://localhost:8000`.
> - **Deployed app (default)** → the account must exist on **Neon** (seed Neon).
>
> **Status:** the deployed Neon backend has been seeded with **all 3 societies**
> (2026-07-14), so every account below works in the app with its default config.
> Re-running the local seed does **not** affect Neon; to refresh Neon, run the
> seed with `DATABASE_URL` set to the Neon connection string.

---

## 1. Green Meadows — Bengaluru

| Role | Name | Email | Phone | Notes |
|---|---|---|---|---|
| Admin | Anita Sharma | `admin@greenmeadows.test` | +919800000001 | Society Secretary |
| Guard | Ram Singh | `guard@greenmeadows.test` | +919800000002 | Gate 1 |
| Resident | Ravi Kumar | `ravi@example.test` | +919800000003 | Verified email (LOCAL password) |
| Resident | Priya Nair | `priya@example.test` | — | **Google account** (no password — use "Continue with Google") |

## 2. Palm Grove Residency — Pune

| Role | Name | Email | Phone | Notes |
|---|---|---|---|---|
| Admin | Rajesh Patil | `admin@palmgrove.test` | +919820000001 | Managing Committee Chairman |
| Guard | Vijay More | `guard@palmgrove.test` | +919820000002 | Main Gate |
| Resident | Sneha Deshpande | `sneha@palmgrove.test` | +919820000003 | Verified email |
| Resident | Arjun Mehta | `arjun@palmgrove.test` | +919820000004 | Verified email |

## 3. Lakeview Enclave — Gurugram

| Role | Name | Email | Phone | Notes |
|---|---|---|---|---|
| Admin | Neha Kapoor | `admin@lakeview.test` | +919840000001 | RWA President |
| Guard | Balbir Yadav | `guard@lakeview.test` | +919840000002 | Tower Lobby |
| Resident | Karan Malhotra | `karan@lakeview.test` | +919840000003 | Verified email |
| Resident | Divya Reddy | `divya@lakeview.test` | — | **Google account** (no password) |

---

## Login tips

- **Password login:** enter the email **or** phone as the identifier, plus
  `password123`.
- **No OTP:** every seeded account is email-verified, so password login goes
  straight through — email or phone, no OTP step. (The OTP flow still exists for
  accounts that sign up with an unverified email; the seeded dummies just don't
  hit it.)
- **Google accounts** (`priya@…`, `divya@…`): no password; require Google
  sign-in to be configured (`GOOGLE_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_CLIENT_ID`).
- **Register a brand-new society** (self-serve): the login screen's "Register a
  new society" link → society + admin form → `auth.registerSociety`, which
  creates the society + its first admin and logs you straight in.

_These are throwaway development credentials for the local/demo databases only —
never reuse them in a real deployment._
