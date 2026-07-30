import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

import {
  isAppCheckConfigured,
  isAppCheckEnforced,
  verifyAppCheckToken,
} from "./app-check";

/**
 * Stands in for Google: a local RSA key pair signs tokens and a stubbed `fetch`
 * serves its public half from the JWKS URL, so the real audience/issuer/expiry/
 * allowlist checks run against tokens we control. A *plausible* token must not
 * be enough, or the client-side attestation is theatre.
 */

const PROJECT = "1009774242772";
const APP_ID = "1:1009774242772:android:bfc59853d47a260bc34441";
const ISSUER = `https://firebaseappcheck.googleapis.com/${PROJECT}`;

/** jose 6 dropped the `KeyLike` alias, so take the type from the generator. */
type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let privateKey: PrivateKey;
let publicJwk: JWK;
const realFetch = globalThis.fetch;

/**
 * One key pair for the whole file, on purpose: `jose` caches the remote key set,
 * so re-keying per test would make every token fail on signature — and the
 * negative tests would then pass even with the audience, issuer and expiry checks
 * missing. A stable pair keeps each test failing for the reason it names.
 */
beforeAll(async () => {
  const { privateKey: priv, publicKey } = await generateKeyPair("RS256");
  privateKey = priv;
  publicJwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key" };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://firebaseappcheck.googleapis.com/v1/jwks")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  process.env.FIREBASE_PROJECT_NUMBER = PROJECT;
  delete process.env.APP_CHECK_ENFORCE;
  delete process.env.APP_CHECK_ALLOWED_APP_IDS;
});

afterEach(() => {
  delete process.env.FIREBASE_PROJECT_NUMBER;
  delete process.env.APP_CHECK_ENFORCE;
  delete process.env.APP_CHECK_ALLOWED_APP_IDS;
});

/** A token as Firebase would mint it, with any field overridable. */
function mint(
  overrides: { aud?: string[]; iss?: string; sub?: string; expiresIn?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? [`projects/${PROJECT}`, "projects/prangan-c1809"])
    .setSubject(overrides.sub ?? APP_ID)
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiresIn ?? "1h")
    .sign(privateKey);
}

describe("verifyAppCheckToken", () => {
  it("accepts a well-formed token and reports the attested app", async () => {
    const res = await verifyAppCheckToken(await mint());
    expect(res).toEqual({ status: "valid", appId: APP_ID });
  });

  it("reports a missing token separately from an invalid one", async () => {
    expect(await verifyAppCheckToken(undefined)).toEqual({ status: "missing" });
    expect(await verifyAppCheckToken("")).toEqual({ status: "missing" });
  });

  it("does not attempt verification when no project number is configured", async () => {
    delete process.env.FIREBASE_PROJECT_NUMBER;
    // A real token, deliberately: `unconfigured` must win over inspecting it.
    expect(await verifyAppCheckToken(await mint())).toEqual({ status: "unconfigured" });
    expect(isAppCheckConfigured()).toBe(false);
  });

  it("rejects a token minted for a different project", async () => {
    const res = await verifyAppCheckToken(
      await mint({ aud: ["projects/999999999999"], iss: ISSUER }),
    );
    expect(res.status).toBe("invalid");
  });

  it("rejects a token from a different issuer", async () => {
    const res = await verifyAppCheckToken(
      await mint({ iss: "https://evil.example.com/1009774242772" }),
    );
    expect(res.status).toBe("invalid");
  });

  it("rejects an expired token", async () => {
    const res = await verifyAppCheckToken(await mint({ expiresIn: "-1h" }));
    expect(res.status).toBe("invalid");
  });

  it("rejects a token signed by a key that is not Google's", async () => {
    const { privateKey: rogue } = await generateKeyPair("RS256");
    // Claims the published `kid`, so it fails on signature, not an unknown key.
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience([`projects/${PROJECT}`])
      .setSubject(APP_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(rogue);

    expect((await verifyAppCheckToken(token)).status).toBe("invalid");
  });

  it("rejects an app id outside the allowlist while accepting one inside it", async () => {
    process.env.APP_CHECK_ALLOWED_APP_IDS = APP_ID;
    expect((await verifyAppCheckToken(await mint())).status).toBe("valid");

    const other = "1:1009774242772:android:0000000000000000000000";
    const res = await verifyAppCheckToken(await mint({ sub: other }));
    expect(res.status).toBe("invalid");
    expect(res.reason).toContain(other);
  });
});

describe("isAppCheckEnforced", () => {
  it("is off unless explicitly turned on", () => {
    expect(isAppCheckEnforced()).toBe(false);
  });

  it("is on once the flag is set and the project number is known", () => {
    process.env.APP_CHECK_ENFORCE = "true";
    expect(isAppCheckEnforced()).toBe(true);
  });

  it("stays off without a project number, so a config slip cannot cause an outage", () => {
    process.env.APP_CHECK_ENFORCE = "true";
    delete process.env.FIREBASE_PROJECT_NUMBER;
    expect(isAppCheckEnforced()).toBe(false);
  });
});
