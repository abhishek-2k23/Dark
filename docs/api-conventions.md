# API Conventions

Canonical reference for how Portl API endpoints are defined, documented, and
consumed. Follow this checklist for every new procedure — the OpenAPI docs at
`/docs` are only as good as the metadata each endpoint carries.

## Surfaces

The same tRPC router is exposed twice by `apps/api`:

| Surface | Mount | Consumer |
|---|---|---|
| REST (OpenAPI) | `/api/v1/...` | Docs UI, curl, any non-tRPC client |
| Native tRPC | `/trpc/<router>.<procedure>` | The Expo app and web app via `@trpc/client` |

Interactive docs: **`/docs`** (Scalar). Raw spec: **`/openapi.json`**, or
regenerate the committed copy at `docs/openapi.json` with `pnpm openapi:generate`.

## Versioning

Every REST path is namespaced under `/api/v1/...`. Router files build paths
with `generatePath("v1/<domain>")` (`packages/trpc/server/utils/path-generator.ts`)
so the version prefix lives in exactly one place per router.

## Authentication

Protected endpoints require `Authorization: Bearer <accessToken>`.

- Access tokens are JWTs, ~15 min TTL, carrying `sub`, `role`, and a numeric
  `level` claim (RESIDENT=100, GUARD=200, ADMIN=300 — gapped for future roles).
- Refresh tokens are opaque, ~30 days, single-use (rotated at
  `/api/v1/auth/refresh`; reuse of a rotated token revokes all sessions).
- In procedure code, pick the narrowest wrapper: `publicProcedure`,
  `protectedProcedure`, `residentProcedure`/`guardProcedure`/`adminProcedure`
  (exact role), or `withMinPermission(level)` (hierarchical).

## Error shape

tRPC error codes map to HTTP statuses on the REST surface automatically
(`UNAUTHORIZED`→401, `FORBIDDEN`→403, `NOT_FOUND`→404, `CONFLICT`→409,
`BAD_REQUEST`→400, `PRECONDITION_FAILED`→412, `TOO_MANY_REQUESTS`→429,
`INTERNAL_SERVER_ERROR`→500). Throw `TRPCError` with the right code in the
service layer; never hand-roll status codes.

REST error responses look like:

```json
{
  "message": "Input validation failed",
  "code": "BAD_REQUEST",
  "data": {
    "code": "BAD_REQUEST",
    "httpStatus": 400,
    "path": "auth.signup",
    "fieldErrors": [
      { "field": "password", "message": "Too small: expected string to have >=8 characters" }
    ]
  }
}
```

`data.fieldErrors` is a `{ field, message }[]` list populated whenever the
error came from Zod input validation (nested paths are dot-joined, e.g.
`"address.pincode"`), and `null` otherwise. tRPC clients get the same
`data.fieldErrors` on their error shape. This is the **only** shape clients
should rely on for form-level validation feedback.

## Rate limiting

Credential/token-issuing endpoints (`login`, `signup`, `google`,
`password-reset/*`) are limited per IP — default **10 requests / 15 min**,
tunable via `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MIN`. Exceeding it
returns 429 with `RateLimit-*` standard headers. `/refresh` is deliberately
not limited (legitimate clients hit it every ~15 min).

**tRPC clients must not batch auth calls** — the limiter matches URL paths,
and a batched URL (`/trpc/auth.login,auth.me`) would bypass it. Use a
`splitLink`/`httpLink` for the auth router, or disable batching.

## CORS & transformer

- Dev allows every origin; prod only the comma-separated `ALLOWED_ORIGINS`
  env list (unset = no CORS headers; native mobile apps are unaffected).
- The tRPC surface uses **superjson** — tRPC clients must configure
  `transformer: superjson` on their link. The REST surface is plain JSON
  (trpc-to-openapi ignores transformers), so REST consumers need nothing.

## Pagination (convention for Phases 4+)

List endpoints use cursor pagination:

- Input: `limit` (default 20, max 100), `cursor` (opaque id of the last item
  seen, optional).
- Output: `{ items: T[], nextCursor: string | null }` — `null` means no more
  pages.

## Checklist: adding a new documented endpoint

1. **Route it** in `packages/trpc/server/routes/<domain>/route.ts`; build the
   path with `generatePath("v1/<domain>")`.
2. **`meta.openapi` on every procedure** — `method`, `path`, `tags`,
   `summary`, `description`, and `protect: true` when bearer auth is required.
   - One **tag per domain router**, matching: `Auth`, `Society`, `Profile`,
     `Visitors`, `Helpdesk`, `Notices`, `Polls`, `Amenities`, `Dues`,
     `Directory`, `Notifications`. (`Society` covers society/tower/flat/
     resident/staff admin; `Profile` covers self-service profile, family
     members, and vehicles.)
   - The `description` of every **mutation documents its error cases**
     (e.g. "Errors: 404 if the flat does not exist, 403 if the guard belongs
     to another society").
3. **Named Zod schemas** for input and output — no inline anonymous objects —
   with `.describe()` on **every field** (these become the field docs).
   Procedures with no input take `zodUndefinedModel` from
   `packages/trpc/server/schema.ts`.
4. **Business logic lives in `packages/services`**, throwing `TRPCError` with
   the correct code; the route file stays a thin schema + wiring layer.
5. Register the router in `packages/trpc/server/index.ts`.
6. Run `pnpm openapi:generate` and commit the updated `docs/openapi.json`;
   eyeball the new endpoint at `/docs`.
