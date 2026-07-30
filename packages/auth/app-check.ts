import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Verifies Firebase App Check tokens — the server half of Play Integrity
 * (`apps/portal/src/lib/appCheck.ts` is the client half). A bearer token proves
 * *who* is calling; this proves *what* is. An unverified token is just a header
 * an attacker can also send.
 *
 * Plain JWKS rather than `firebase-admin`: this is a public-key signature check,
 * and the SDK would want service-account credentials deployed for no gain.
 */

/** Google's published App Check signing keys. */
const JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks";

// Created lazily so importing this module never touches the network; `jose`
// caches the key set and re-fetches on an unknown `kid`.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keySet() {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

/** The numeric Firebase project number, e.g. `1009774242772`. */
function projectNumber(): string | null {
  return process.env.FIREBASE_PROJECT_NUMBER ?? null;
}

/** Without a project number there is no audience to validate against. */
export function isAppCheckConfigured(): boolean {
  return projectNumber() !== null;
}

/**
 * Hard-fail mode. Off by default — turning it on rejects every install that
 * cannot attest, including old builds. Run in monitor mode until the logs show
 * attested traffic has replaced them.
 */
export function isAppCheckEnforced(): boolean {
  return process.env.APP_CHECK_ENFORCE === "true" && isAppCheckConfigured();
}

/**
 * Comma-separated Firebase app IDs allowed to call us. Unset = any app in the
 * project passes.
 */
function allowedAppIds(): string[] | null {
  const raw = process.env.APP_CHECK_ALLOWED_APP_IDS;
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export type AppCheckStatus =
  /** No project number configured — verification was not attempted. */
  | "unconfigured"
  /** No `X-Firebase-AppCheck` header on the request. */
  | "missing"
  /** Signature, audience, issuer, expiry and app ID all check out. */
  | "valid"
  /** A token was sent and it did not verify. */
  | "invalid";

export interface AppCheckResult {
  status: AppCheckStatus;
  /** The attested Firebase app ID (the token's `sub`), when valid. */
  appId?: string;
  /** Why an `invalid` result failed — logged, never returned to the client. */
  reason?: string;
}

/** Never throws; every failure comes back as an `invalid` result with a reason. */
export async function verifyAppCheckToken(
  token: string | undefined | null,
): Promise<AppCheckResult> {
  const project = projectNumber();
  if (!project) return { status: "unconfigured" };
  if (!token) return { status: "missing" };

  let payload: JWTPayload;
  try {
    // `aud` carries both `projects/<number>` and `projects/<id>`; jose treats a
    // string audience as "must be present in the aud array".
    ({ payload } = await jwtVerify(token, keySet(), {
      issuer: `https://firebaseappcheck.googleapis.com/${project}`,
      audience: `projects/${project}`,
      algorithms: ["RS256"],
    }));
  } catch (err) {
    return { status: "invalid", reason: err instanceof Error ? err.message : String(err) };
  }

  const appId = typeof payload.sub === "string" ? payload.sub : undefined;
  if (!appId) return { status: "invalid", reason: "token has no sub (app id)" };

  const allowed = allowedAppIds();
  if (allowed && !allowed.includes(appId)) {
    return { status: "invalid", reason: `app id ${appId} is not allowlisted` };
  }

  return { status: "valid", appId };
}
