import { TRPCError } from "@trpc/server";
import { OAuth2Client } from "google-auth-library";
import { prisma, AdminDesignation, EmailOtpPurpose, type User } from "@repo/database";
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
  OTP_TTL_SECONDS,
} from "@repo/auth";
import { logger } from "@repo/logger";
import {
  sendOtpEmail,
  sendAccountDeletionOtpEmail,
  sendPasswordResetEmail,
  isMailerConfigured,
} from "@repo/mailer";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: User["role"];
  avatarUrl: string | null;
  /**
   * Null for a Google user who signed in before any invite existed for their
   * email. They have an account but no society, so there is nothing in the app
   * for them to see — clients must hold them at a "waiting for an invite" gate
   * rather than routing into a role stack. Resolves itself on their next
   * sign-in or refresh once an admin invites them (see `claimPendingInvite`).
   */
  societyId: string | null;
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
    societyId: user.societyId,
  };
}

/**
 * Attach a society-less user to a PENDING invite matching their email, if one
 * exists now, and mark that invite CLAIMED.
 *
 * Google sign-in creates an account even when nobody has invited that email yet
 * (the user then sits at the app's "waiting for an invite" gate). This is what
 * lets them out of it: called on every sign-in and refresh, so the moment an
 * admin adds the invite their next session picks up the society and flat. Users
 * who already have a society are returned untouched, so this is a cheap no-op
 * on the overwhelmingly common path.
 */
async function claimPendingInvite(user: User): Promise<User> {
  if (user.societyId || !user.email) return user;

  const invite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", email: user.email },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) return user;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      // No residentProfile can exist yet: it's created with the flat below, and
      // only ever alongside a societyId.
      data: {
        societyId: invite.societyId,
        residentProfile: { create: { flatId: invite.flatId } },
      },
    });
    await tx.pendingResidentInvite.update({
      where: { id: invite.id },
      data: { status: "CLAIMED", claimedAt: new Date() },
    });
    logger.info("Society-less Google user claimed a pending invite", {
      userId: user.id,
      societyId: invite.societyId,
    });
    return updated;
  });
}

/**
 * Is this row a bulk-imported resident nobody has claimed yet?
 *
 * Such a row is created by `resident/import.service.ts` when an admin migrates
 * a register: it holds a real name, email/phone and flat, but no credential of
 * any kind. `importedAt` is the marker; the credential checks are belt and
 * braces, so a claimed account can never be mistaken for a claimable one even
 * if the stamp were somehow left behind.
 *
 * A claimable row is *not* treated as "an account already exists" — the whole
 * point of the migration is that the resident signs up normally and lands on
 * the flat the admin already assigned them.
 */
function isUnclaimedImport(user: User): boolean {
  return user.importedAt !== null && user.passwordHash === null && user.googleId === null;
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
 * Test/demo accounts must NEVER be OTP-gated on email login — hardcoded so the
 * seeded credentials always log in straight through, regardless of their
 * `emailVerified` flag. Identified by the reserved `.test` TLD (RFC 2606, never
 * a real domain) plus an explicit allowlist for any non-`.test` demo emails.
 */
const TEST_ACCOUNT_EMAILS = new Set<string>([
  "ravi@example.test",
  "priya@example.test",
]);
function isTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.endsWith(".test") || TEST_ACCOUNT_EMAILS.has(e);
}

/**
 * Issue a fresh email OTP for a user (for the given `purpose`), invalidating any
 * earlier outstanding codes of that purpose so only one is ever live. The code
 * is emailed via the SMTP mailer (a no-op that logs when SMTP is unconfigured);
 * returns the raw code so callers can optionally echo it under OTP_DEV_ECHO.
 */
async function issueEmailOtp(
  user: User,
  purpose: EmailOtpPurpose = EmailOtpPurpose.EMAIL_VERIFICATION,
): Promise<string> {
  const code = generateOtp();
  await prisma.$transaction([
    prisma.emailOtp.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailOtp.create({
      data: {
        userId: user.id,
        purpose,
        codeHash: hashOtp(code),
        expiresAt: otpExpiry(),
      },
    }),
  ]);
  // Without SMTP the code can't be emailed — log it so local dev stays testable
  // (pair with OTP_DEV_ECHO). With SMTP configured the code never hits the logs.
  logger.info("Email OTP issued", {
    email: user.email,
    purpose,
    ...(isMailerConfigured() ? {} : { code }),
  });
  if (user.email) {
    const ttlMinutes = Math.round(OTP_TTL_SECONDS / 60);
    if (purpose === EmailOtpPurpose.ACCOUNT_DELETION) {
      await sendAccountDeletionOtpEmail({ to: user.email, code, ttlMinutes });
    } else {
      await sendOtpEmail({ to: user.email, code, ttlMinutes });
    }
  }
  return code;
}

/**
 * Validate a candidate OTP `code` for a user + purpose against the newest
 * outstanding code, incrementing the attempt counter on a wrong guess. Returns
 * the matched (still-unconsumed) OTP id on success; throws the same opaque
 * UNAUTHORIZED on any failure (unknown/expired/wrong) so callers can't
 * distinguish cases, and TOO_MANY_REQUESTS once the attempt cap is hit. The
 * caller is responsible for marking the returned OTP consumed.
 */
async function assertOtpValid(
  userId: string,
  code: string,
  purpose: EmailOtpPurpose,
): Promise<string> {
  const invalid = new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid or expired code",
  });
  const otp = await prisma.emailOtp.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) throw invalid;
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many incorrect attempts — request a new code",
    });
  }
  if (!verifyOtp(code, otp.codeHash)) {
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalid;
  }
  return otp.id;
}

function identifierFilter(email?: string, phone?: string) {
  const or: Array<{ email: string } | { phone: string }> = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  return or;
}

/**
 * Result of a signup: the account exists, but no session yet — the email must
 * first be proven via the OTP just sent to it (`verifyEmailOtp` issues the
 * session and marks the email verified).
 */
export interface SignupChallenge {
  status: "OTP_REQUIRED";
  channel: "email";
  /** The email the OTP was sent to (echoed so the client can prompt). */
  email: string;
  /** Present only when OTP_DEV_ECHO=true — never enable in production. */
  devCode?: string;
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SignupChallenge> {
  const { name, email, password } = input;
  if (!email) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email address",
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // A bulk-imported resident signing up for the first time: set the password
    // on the row the admin already created rather than rejecting them, so they
    // keep the flat, dues and visitor history migrated under their name.
    //
    // No session is issued here either — the emailed OTP below still has to
    // prove the mailbox is theirs, which is exactly the guarantee the normal
    // signup path gives. Until that succeeds the account stays credential-less
    // from the caller's point of view.
    if (isUnclaimedImport(existing)) {
      const claimed = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash: await hashPassword(password),
          importedAt: null,
        },
      });
      logger.info("Imported resident claimed their account via signup", {
        userId: claimed.id,
        societyId: claimed.societyId,
      });
      const claimCode = await issueEmailOtp(claimed);
      return {
        status: "OTP_REQUIRED",
        channel: "email",
        email,
        ...(otpDevEcho() ? { devCode: claimCode } : {}),
      };
    }
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists with this email",
    });
  }

  const invite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", email },
    orderBy: { createdAt: "desc" },
  });

  const passwordHash = await hashPassword(password);

  // No invite: the account is still created, just society-less — mirroring
  // googleLogin. Clients hold these users at the no-society gate, where they
  // can send a join request; an admin invite or approval attaches the society
  // on their next refresh. No residentProfile yet: that needs a flat, and the
  // flat only comes with the invite/approval.
  const user = invite
    ? await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name,
            email,
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
      })
    : await prisma.user.create({
        data: { name, email, passwordHash, role: "RESIDENT" },
      });
  if (!invite) {
    logger.info("Created society-less user via signup (no matching invite)", {
      userId: user.id,
    });
  }

  // No session until the emailed code proves the address is theirs — the
  // account is created unverified and `verifyEmailOtp` logs them in.
  const code = await issueEmailOtp(user);
  return {
    status: "OTP_REQUIRED",
    channel: "email",
    email,
    ...(otpDevEcho() ? { devCode: code } : {}),
  };
}

/**
 * Public self-serve society onboarding: register a brand-new society together
 * with its first ADMIN account in a single transaction, then issue a session.
 *
 * This is the only way a society (and its founding admin) enters the system —
 * every subsequent admin/guard is created by an existing admin via
 * `staff.create`, and residents join through invite-gated signup. The admin's
 * email starts UNVERIFIED (same as resident signup), so a later email login is
 * OTP-gated; the session returned here logs them in immediately regardless.
 */
export async function registerSociety(input: {
  society: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  admin: {
    name: string;
    email?: string;
    phone?: string;
    password: string;
    designation?: AdminDesignation;
  };
}): Promise<AuthSession> {
  const { society, admin } = input;
  if (!admin.email && !admin.phone) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email or a phone number for the admin account",
    });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: identifierFilter(admin.email, admin.phone) },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists with this email or phone",
    });
  }

  const passwordHash = await hashPassword(admin.password);
  const user = await prisma.$transaction(async (tx) => {
    const createdSociety = await tx.society.create({
      data: {
        name: society.name,
        address: society.address,
        city: society.city,
        state: society.state,
        pincode: society.pincode,
      },
    });
    return tx.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        passwordHash,
        role: "ADMIN",
        societyId: createdSociety.id,
        adminProfile: {
          create: {
            societyId: createdSociety.id,
            // The founder is the society's top office bearer by default.
            designation: admin.designation ?? AdminDesignation.PRESIDENT,
          },
        },
      },
    });
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
      message: isUnclaimedImport(user)
        ? // Added by an admin's bulk import and never claimed: there is no
          // password to be wrong, so send them to signup rather than leaving
          // them guessing at credentials that were never issued. Signup is
          // email-only, hence the fallback for rows imported with a phone.
          "Your society admin has already added you — sign up with your email address to set a " +
          "password, or ask them to add your email to the society records"
        : "This account uses Google sign-in — use 'Continue with Google'",
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

  // Email login against an unverified email must prove ownership via OTP first —
  // except hardcoded test/demo accounts, which always skip the OTP gate.
  if (usedEmail && !user.emailVerified && !isTestAccount(user.email)) {
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
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired code" });
  }
  if (!user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account has been deactivated — contact your society admin",
    });
  }

  const otpId = await assertOtpValid(
    user.id,
    input.code,
    EmailOtpPurpose.EMAIL_VERIFICATION,
  );

  const [, verifiedUser] = await prisma.$transaction([
    prisma.emailOtp.update({
      where: { id: otpId },
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
    // They may have been invited since last time — this is how a user who
    // signed in early gets out of the app's "waiting for an invite" gate.
    return issueSession(await claimPendingInvite(byGoogleId));
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (byEmail) {
    // Link Google to the existing password account and log them in. Only when
    // Google attests the address (`email_verified`) — that attestation is what
    // makes it the same person and not someone who registered a lookalike
    // Google account over an unverified mailbox.
    if (!payload.email_verified) {
      throw new TRPCError({
        code: "CONFLICT",
        message: isUnclaimedImport(byEmail)
          ? // Pointing an imported resident at a password they don't have would
            // be a dead end — signup is the path that sets one.
            "Your society admin has already added this email — sign up to set a password"
          : "An account already exists with this email — log in with your password",
      });
    }
    if (!byEmail.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This account has been deactivated — contact your society admin",
      });
    }
    const wasImport = isUnclaimedImport(byEmail);
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: payload.sub,
        // Google has proven the mailbox, so the password-login OTP gate is
        // satisfied too.
        emailVerified: true,
        avatarUrl: byEmail.avatarUrl ?? payload.picture ?? null,
        // A bulk-imported row is claimed by this sign-in: Google is now its
        // credential, so it is no longer an unclaimed import.
        ...(wasImport ? { authProvider: "GOOGLE" as const, importedAt: null } : {}),
      },
    });
    logger.info(
      wasImport
        ? "Imported resident claimed their account via Google sign-in"
        : "Linked Google sign-in to existing password account",
      { userId: linked.id },
    );
    return issueSession(await claimPendingInvite(linked));
  }

  const invite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", email: payload.email },
    orderBy: { createdAt: "desc" },
  });

  // Nobody has invited this email yet. Create the account anyway, without a
  // society — signing in is allowed, but there's no society data to show, so
  // clients hold these users at a "waiting for an invite" gate. They're picked
  // up by `claimPendingInvite` on their next sign-in/refresh once an admin adds
  // them, which is why this isn't a dead end. No residentProfile: that needs a
  // flat, and the flat only comes from an invite.
  if (!invite) {
    const user = await prisma.user.create({
      data: {
        name: payload.name ?? payload.email,
        email: payload.email,
        authProvider: "GOOGLE",
        googleId: payload.sub,
        avatarUrl: payload.picture,
        role: "RESIDENT",
      },
    });
    logger.info("Created society-less Google user (no matching invite)", {
      userId: user.id,
    });
    return issueSession(user);
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
  // Lets the "waiting for an invite" gate clear on a plain refresh, without
  // making the user sign out and back in.
  return issueSession(await claimPendingInvite(stored.user));
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
  // Same log-vs-email tradeoff as OTP: the token is only logged when there's no
  // mailer configured, so the dev reset flow still works without SMTP.
  logger.info("Password reset requested", {
    email: input.email,
    ...(isMailerConfigured() ? {} : { token }),
  });
  await sendPasswordResetEmail({ to: input.email, token });
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

/**
 * Result of an account-deletion request. `DEMO_BLOCKED` is returned for the
 * seeded demo/test accounts (they can never be deleted); every other case —
 * real account, unknown email, or an already-deactivated account — returns
 * `OTP_SENT` with no distinguishing detail, so the endpoint can't be used to
 * probe which emails have accounts. A code is only actually emailed for a real,
 * active account.
 */
export type AccountDeletionRequestResult =
  | { status: "OTP_SENT"; devCode?: string }
  | { status: "DEMO_BLOCKED" };

/**
 * Begin account deletion: email a one-time code that `confirmAccountDeletion`
 * exchanges for the actual deletion. Demo/test accounts are refused up front.
 */
export async function requestAccountDeletion(input: {
  email: string;
}): Promise<AccountDeletionRequestResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (isTestAccount(input.email)) {
    return { status: "DEMO_BLOCKED" };
  }

  if (user && user.isActive) {
    const code = await issueEmailOtp(user, EmailOtpPurpose.ACCOUNT_DELETION);
    if (otpDevEcho()) return { status: "OTP_SENT", devCode: code };
  }
  // Unknown or already-deactivated account: report success without sending
  // anything, so the response is indistinguishable from the real case.
  return { status: "OTP_SENT" };
}

/**
 * Confirm and perform account deletion after the emailed OTP. We soft-delete:
 * the row is kept (to preserve foreign keys on notices/tickets/visitors the user
 * authored) but deactivated and stripped of all personal data, and every session
 * is revoked. The freed email/phone can be used to register a new account.
 */
export async function confirmAccountDeletion(input: {
  email: string;
  code: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired code" });
  }
  if (isTestAccount(user.email)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Demo accounts cannot be deleted.",
    });
  }

  const otpId = await assertOtpValid(
    user.id,
    input.code,
    EmailOtpPurpose.ACCOUNT_DELETION,
  );

  await prisma.$transaction([
    prisma.emailOtp.update({
      where: { id: otpId },
      data: { consumedAt: new Date() },
    }),
    // Anonymize + deactivate. Nulling email/phone/googleId releases those unique
    // identifiers for reuse; the account can never authenticate again.
    prisma.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted user",
        email: null,
        phone: null,
        passwordHash: null,
        googleId: null,
        avatarUrl: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emailVerified: false,
        isActive: false,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  logger.info("Account deleted (soft)", { userId: user.id });
}
