# Demo credentials

Seeded by `packages/database/seed.ts` — three sample societies with full data
(towers, flats, residents, visitors, notices, polls, amenities, dues).

**Every password-based account uses `password123`.**

> **These accounts already exist on the deployed API**
> (`https://dark-9k8o.onrender.com`), which is what the mobile app points at by
> default. You can log in without running anything locally.

---

## Start here

To see the app at its fullest, log in as the **Green Meadows admin** — that
society has the most seeded data:

```
admin@greenmeadows.test  /  password123
```

Then try `ravi@example.test` (resident) and `guard@greenmeadows.test` (guard) to
see the same society from the other two sides.

---

## 1. Green Meadows — Bengaluru

The richest dataset: visitors, complaints, bookings, dues and payments.

| Role | Name | Email | Phone | Notes |
|---|---|---|---|---|
| Admin | Anita Sharma | `admin@greenmeadows.test` | +919800000001 | Secretary |
| Guard | Ram Singh | `guard@greenmeadows.test` | +919800000002 | Gate 1 |
| Resident | Ravi Kumar | `ravi@example.test` | +919800000003 | Flat A/101 — has visitors, tickets, bookings, dues |
| Resident | Priya Nair | `priya@example.test` | — | **Google-only**, no password |

## 2. Palm Grove Residency — Pune

| Role | Name | Email | Phone |
|---|---|---|---|
| Admin | Rajesh Patil | `admin@palmgrove.test` | +919820000001 |
| Guard | Vijay More | `guard@palmgrove.test` | +919820000002 |
| Resident | Sneha Deshpande | `sneha@palmgrove.test` | +919820000003 |
| Resident | Arjun Mehta | `arjun@palmgrove.test` | +919820000004 |

## 3. Lakeview Enclave — Gurugram

| Role | Name | Email | Phone | Notes |
|---|---|---|---|---|
| Admin | Neha Kapoor | `admin@lakeview.test` | +919840000001 | RWA President |
| Guard | Balbir Yadav | `guard@lakeview.test` | +919840000002 | |
| Resident | Karan Malhotra | `karan@lakeview.test` | +919840000003 | |
| Resident | Divya Reddy | `divya@lakeview.test` | — | **Google-only**, no password |

---

## How to log in

- The identifier field takes **either** the email **or** the phone number.
- **Seeded accounts skip the OTP step.** They are email-verified, and addresses
  ending in `.test` are treated as demo accounts. A real signup with an
  unverified address *is* OTP-gated — see [security.md](security.md) §2.
- **Google accounts** (`priya@`, `divya@`) have no password. They need Google
  sign-in configured (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`).

## Trying the flows that need two people

Several features are interesting precisely because two roles meet:

| To see | Log in as | Then as |
|---|---|---|
| Visitor approval | Guard — register a walk-in visitor | Resident — approve or deny it |
| Guest pass | Resident — pre-approve a guest | Guard — verify the code |
| Complaint workflow | Resident — raise a ticket | Admin — assign and resolve it |
| Offline payment | Resident — submit a receipt | Admin — verify it in the queue |
| Join request | Sign up with a fresh email, request to join | Admin — approve with a flat |

Two devices aren't required — log out and back in as the other role.

---

## Running against a local database instead

`pnpm --filter @repo/database db:seed` populates the **local** Postgres only. To
use it, point the app at your machine:

```sh
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Seeding is destructive — it clears the target database first. Take care never to
run it against a database you want to keep.
