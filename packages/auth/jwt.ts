import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@repo/database";
import { permissionLevelOf } from "./permissions";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // ~15 min
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const PASSWORD_RESET_TTL_SECONDS = 30 * 60; // 30 min

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return secret;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  level: number;
}

export function signAccessToken(user: { id: string; role: Role }): string {
  return jwt.sign(
    { role: user.role, level: permissionLevelOf(user.role) },
    jwtSecret(),
    { subject: user.id, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === "string" || !payload.sub) return null;
    const { sub, role, level } = payload as jwt.JwtPayload & AccessTokenPayload;
    if (!role || typeof level !== "number") return null;
    return { sub, role, level };
  } catch {
    return null;
  }
}

export interface RefreshTokenBundle {
  /** Opaque token handed to the client — never stored server-side. */
  token: string;
  /** SHA-256 of the token; this is what the RefreshToken table stores. */
  tokenHash: string;
  expiresAt: Date;
}

export function signRefreshToken(): RefreshTokenBundle {
  const token = crypto.randomBytes(48).toString("base64url");
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Fingerprint of the current password hash, embedded in reset tokens so a
 * token stops working as soon as the password it was issued against changes.
 */
export function passwordFingerprint(passwordHash: string | null): string {
  return crypto
    .createHash("sha256")
    .update(passwordHash ?? "")
    .digest("hex")
    .slice(0, 16);
}

export function signPasswordResetToken(user: {
  id: string;
  passwordHash: string | null;
}): string {
  return jwt.sign(
    { purpose: "password_reset", pwf: passwordFingerprint(user.passwordHash) },
    jwtSecret(),
    { subject: user.id, expiresIn: PASSWORD_RESET_TTL_SECONDS },
  );
}

export function verifyPasswordResetToken(
  token: string,
): { userId: string; passwordFingerprint: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === "string" || !payload.sub) return null;
    if (payload.purpose !== "password_reset" || typeof payload.pwf !== "string")
      return null;
    return { userId: payload.sub, passwordFingerprint: payload.pwf };
  } catch {
    return null;
  }
}
