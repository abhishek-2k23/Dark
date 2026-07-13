import { TRPCError } from "@trpc/server";
import { OAuth2Client } from "google-auth-library";
import { prisma, type User } from "@repo/database";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  passwordFingerprint,
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_MAX_ATTEMPTS,
} from "@repo/auth";
import { logger } from "@repo/logger";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: User["role"];
  avatarUrl: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Result of a password login. A verified email or any phone login yields a
 * session immediately; logging in with an *unverified* email instead emails an
 * OTP and asks the client to confirm it via `verifyEmailOtp`.
 */
export type LoginResult =
  | { status: "SUCCESS"; session: AuthSession }
  | {
      status: "OTP_REQUIRED";
      channel: "email";
      /** The email the OTP was sent to (echoed so the client can prompt). */
      email: string;
      /** Present only when OTP_DEV_ECHO=true — never enable in production. */
      devCode?: string;
    };

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}

async function issueSession(user: User): Promise<AuthSession> {
  const refresh = signRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    },
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    user: toAuthUser(user),
  };
}

/** Whether OTP codes are echoed in API responses (local/dev testing only). */
function otpDevEcho(): boolean {
  return process.env.OTP_DEV_ECHO === "true";
}

/**
 * Issue a fresh email-verification OTP for a user, invalidating any earlier
 * outstanding codes so only one is ever live. Delivery is stubbed to the server
 * log in development (same approach as password reset); returns the raw code so
 * callers can optionally echo it under OTP_DEV_ECHO.
 */
async function issueEmailOtp(user: User): Promise<string> {
  const code = generateOtp();
  await prisma.$transaction([
    prisma.emailOtp.updateMany({
      where: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
    prisma.emailOtp.create({
      data: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        codeHash: hashOtp(code),
        expiresAt: otpExpiry(),
      },
    }),
  ]);
  logger.info("Email verification OTP issued", { email: user.email, code });
  return code;
}

function identifierFilter(email?: string, phone?: string) {
  const or: Array<{ email: string } | { phone: string }> = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  return or;
}

export async function signup(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}): Promise<AuthSession> {
  const { name, email, phone, password } = input;
  if (!email && !phone) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email or a phone number",
    });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: identifierFilter(email, phone) },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists with this email or phone",
    });
  }

  const invite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", OR: identifierFilter(email, phone) },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "No invite found for this email or phone — ask your society admin to add you first",
    });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: "RESIDENT",
        societyId: invite.societyId,
        residentProfile: { create: { flatId: invite.flatId } },
      },
    });
    await tx.pendingResidentInvite.update({
      where: { id: invite.id },
      data: { status: "CLAIMED", claimedAt: new Date() },
    });
    return created;
  });

  return issueSession(user);
}

export async function login(input: {
  identifier: string;
  password: string;
}): Promise<LoginResult> {
  const { identifier, password } = input;
  // Resolve the identifier as an email first, then as a phone number. We track
  // which one matched: the OTP gate applies only to *email* logins.
  const byEmail = await prisma.user.findUnique({
    where: { email: identifier },
  });
  const user =
    byEmail ??
    (await prisma.user.findUnique({ where: { phone: identifier } }));
  const usedEmail = byEmail !== null;

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
  }
  if (!user.passwordHash) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "This account uses Google sign-in — use 'Continue with Google'",
    });
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
  }
  if (!user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account has been deactivated — contact your society admin",
    });
  }

  // Email login against an unverified email must prove ownership via OTP first.
  if (usedEmail && !user.emailVerified) {
    const code = await issueEmailOtp(user);
    return {
      status: "OTP_REQUIRED",
      channel: "email",
      email: user.email!,
      ...(otpDevEcho() ? { devCode: code } : {}),
    };
  }

  return { status: "SUCCESS", session: await issueSession(user) };
}

/**
 * Confirm an email-verification OTP. On success the email is marked verified
 * (so future email logins skip the OTP) and a session is issued.
 */
export async function verifyEmailOtp(input: {
  email: string;
  code: string;
}): Promise<AuthSession> {
  const invalid = new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid or expired code",
  });

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw invalid;
  if (!user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account has been deactivated — contact your society admin",
    });
  }

  const otp = await prisma.emailOtp.findFirst({
    where: {
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) throw invalid;
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many incorrect attempts — request a new code",
    });
  }

  if (!verifyOtp(input.code, otp.codeHash)) {
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalid;
  }

  const [, verifiedUser] = await prisma.$transaction([
    prisma.emailOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    }),
  ]);

  return issueSession(verifiedUser);
}

/**
 * Re-send an email-verification OTP. Silently no-ops for accounts that don't
 * exist, are Google-only, are already verified, or are deactivated — so it can
 * never be used to probe which emails have accounts.
 */
export async function resendEmailOtp(input: {
  email: string;
}): Promise<{ devCode?: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user && user.passwordHash && !user.emailVerified && user.isActive) {
    const code = await issueEmailOtp(user);
    if (otpDevEcho()) return { devCode: code };
  }
  return {};
}

export async function googleLogin(input: {
  idToken: string;
}): Promise<AuthSession> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google login is not configured on this server",
    });
  }

  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: input.idToken,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid Google ID token",
    });
  }
  if (!payload?.sub || !payload.email) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Google token is missing required profile fields",
    });
  }

  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: payload.sub },
  });
  if (byGoogleId) {
    if (!byGoogleId.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This account has been deactivated — contact your society admin",
      });
    }
    return issueSession(byGoogleId);
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (byEmail) {
    // MVP: no account linking (see plan "Open Items").
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "An account already exists with this email — log in with your password",
    });
  }

  const invite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", email: payload.email },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "No invite found for this email — ask your society admin to add you first",
    });
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: payload.name ?? payload.email!,
        email: payload.email,
        authProvider: "GOOGLE",
        googleId: payload.sub,
        avatarUrl: payload.picture,
        role: "RESIDENT",
        societyId: invite.societyId,
        residentProfile: { create: { flatId: invite.flatId } },
      },
    });
    await tx.pendingResidentInvite.update({
      where: { id: invite.id },
      data: { status: "CLAIMED", claimedAt: new Date() },
    });
    return created;
  });

  return issueSession(user);
}

export async function refreshSession(input: {
  refreshToken: string;
}): Promise<AuthSession> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid refresh token" });
  }
  if (stored.revokedAt) {
    // Reuse of a rotated token is a compromise signal: kill every session.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.info("Refresh token reuse detected — revoked all sessions", {
      userId: stored.userId,
    });
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Refresh token reuse detected — all sessions revoked, log in again",
    });
  }
  if (stored.expiresAt < new Date()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Refresh token expired" });
  }
  if (!stored.user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account has been deactivated — contact your society admin",
    });
  }

  // Rotate: revoke the used token, issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueSession(stored.user);
}

export async function logout(input: { refreshToken: string }): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always succeed from the caller's perspective (no account enumeration).
  if (!user || !user.passwordHash) return;

  const token = signPasswordResetToken(user);
  // Email delivery is not wired up yet — surface the token in server logs so
  // the flow is testable in development. Swap for a real mailer later.
  logger.info("Password reset requested", { email: input.email, token });
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const parsed = verifyPasswordResetToken(input.token);
  if (!parsed) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired password reset token",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user || passwordFingerprint(user.passwordHash) !== parsed.passwordFingerprint) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired password reset token",
    });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // A password reset invalidates every existing session.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
