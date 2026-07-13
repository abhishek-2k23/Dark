import { beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  hashRefreshToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  passwordFingerprint,
} from "./jwt";
import { PermissionLevel, hasMinPermission, permissionLevelOf } from "./permissions";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(hash).toMatch(/^\$argon2/);
    expect(await verifyPassword(hash, "s3cret-password")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("returns false instead of throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});

describe("access token", () => {
  it("round-trips user id, role, and permission level", () => {
    const token = signAccessToken({ id: "user-1", role: "GUARD" });
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ sub: "user-1", role: "GUARD", level: 200 });
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ id: "user-1", role: "RESIDENT" });
    expect(verifyAccessToken(token.slice(0, -2) + "xx")).toBeNull();
  });
});

describe("refresh token", () => {
  it("issues an opaque token whose hash matches hashRefreshToken", () => {
    const bundle = signRefreshToken();
    expect(bundle.token).not.toEqual(bundle.tokenHash);
    expect(hashRefreshToken(bundle.token)).toEqual(bundle.tokenHash);
    expect(bundle.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("issues unique tokens", () => {
    expect(signRefreshToken().token).not.toEqual(signRefreshToken().token);
  });
});

describe("password reset token", () => {
  it("round-trips and binds to the current password hash", () => {
    const token = signPasswordResetToken({ id: "user-1", passwordHash: "old-hash" });
    const parsed = verifyPasswordResetToken(token);
    expect(parsed?.userId).toBe("user-1");
    expect(parsed?.passwordFingerprint).toBe(passwordFingerprint("old-hash"));
    // A changed password produces a different fingerprint → token unusable.
    expect(parsed?.passwordFingerprint).not.toBe(passwordFingerprint("new-hash"));
  });

  it("rejects an access token used as a reset token", () => {
    const token = signAccessToken({ id: "user-1", role: "RESIDENT" });
    expect(verifyPasswordResetToken(token)).toBeNull();
  });
});

describe("permission levels", () => {
  it("uses gapped numeric levels", () => {
    expect(PermissionLevel).toEqual({ RESIDENT: 100, GUARD: 200, ADMIN: 300 });
    expect(permissionLevelOf("ADMIN")).toBe(300);
  });

  it("compares by minimum level", () => {
    expect(hasMinPermission("ADMIN", PermissionLevel.GUARD)).toBe(true);
    expect(hasMinPermission("GUARD", PermissionLevel.GUARD)).toBe(true);
    expect(hasMinPermission("RESIDENT", PermissionLevel.GUARD)).toBe(false);
  });
});
