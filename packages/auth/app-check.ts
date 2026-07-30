import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Verification of Firebase App Check tokens — the server half of Play Integrity
 * (`apps/portal/src/lib/appCheck.ts` is the client half).
 *
 * A bearer token proves *who* is calling. It says nothing about *what* is
 * calling, and it is the thing most easily lifted out of a device: pull it from
 * a rooted phone or a proxied session and every endpoint that user can reach is
 * scriptable. An App Check token is a short-lived JWT that Google signs only
 * after Play Integrity confirms the caller is an unmodified `com.prangan.app`
 * installed by Play on a device that passes its device checks. Verifying it here
 * is what makes the client-side attestation mean anything — an unverified token
 * is just a header an attacker can also send.
 *
 * Why plain JWKS verification rather than `firebase-admin`: this is a public-key
 * signature check against a published key set. `appCheck().verifyToken()` does
 * the same thing behind a dependency that also wants service-account
 * credentials deployed, which is a secret to leak and rotate for no gain here.
 */

/** Google's published App Check signing keys. */
const JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks";

/**
 * Fetched once and cached by `jose`, which also handles re-fetching on an
 * unknown `kid` (key rotation) with its own cooldown. Created lazily so merely
 * importing this module never touches the network — tests and the seed script
 * import `@repo/auth` too.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keySet() {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

/** The numeric Firebase project number, e.g. `1009774242772`. */
function projectNumber(): string | null {
  return process.env.FIREBASE_PROJECT_NUMBER ?? null;
}

/**
 * Whether attestation is even checkable. Without the project number there is
 * nothing to validate the audience against, so tokens are neither trusted nor
 * blamed — the result is `unconfigured`.
 */
export function isAppCheckConfigured(): boolean {
  return projectNumber() !== null;
}

/**
 * Hard-fail mode. Off by default: turning it on rejects every caller that
 * cannot attest, which includes older installs still on a build without the
 * Firebase native module. Run in monitor mode until the logs show attested
 * traffic has replaced them.
 */
export function isAppCheckEnforced(): boolean {
  return process.env.APP_CHECK_ENFORCE === "true" && isAppCheckConfigured();
}

/**
 * Firebase app IDs allowed to call us, comma-separated
 * (`1:1009774242772:android:bfc5…`). Optional: when unset, any app in the
 * project passes. Set it and a token minted for some other app registered in
 * the same Firebase project stops being accepted.
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

/**
 * Verifies an App Check token. Never throws; every failure mode comes back as
 * an `invalid` result with a reason.
 */
export async function verifyAppCheckToken(
  token: string | undefined | null,
): Promise<AppCheckResult> {
  const project = projectNumber();
  if (!project) return { status: "unconfigured" };
  if (!token) return { status: "missing" };

  let payload: JWTPayload;
  try {
    // App Check tokens are RS256 with `aud` carrying BOTH `projects/<number>`
    // and `projects/<id>`; jose treats a string audience as "must be present in
    // the aud array", which is exactly the check Google documents.
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
