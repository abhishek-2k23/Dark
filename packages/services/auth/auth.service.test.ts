import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { hashPassword, signPasswordResetToken } from "@repo/auth";

import * as authService from "./auth.service";

const h = vi.hoisted(() => {
  const runId = Date.now().toString(36);
  return {
    runId,
    googleEmail: `google-${runId}@test.local`,
    googleSub: `gsub-${runId}`,
  };
});

// Fake Google verifier: tokens of the form "valid:<email>" verify and carry
// that email (Google-attested); "unverified:<email>" carries an email Google
// has NOT attested; anything else is rejected — mirrors google-auth-library.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      const [kind, email] = idToken.split(":");
      if ((kind !== "valid" && kind !== "unverified") || !email) {
        throw new Error("invalid token");
      }
      return {
        getPayload: () => ({
          sub: `gsub-${email}`,
          email,
          email_verified: kind === "valid",
          name: "Google Test User",
        }),
      };
    }
  },
}));

// Stub the SMTP mailer so tests never hit the network / send real email — the
// repo .env may carry real SMTP credentials. OTP + reset codes are still
// asserted through OTP_DEV_ECHO, so nothing here depends on delivery.
vi.mock("@repo/mailer", () => ({
  isMailerConfigured: () => false,
  sendOtpEmail: vi.fn(async () => {}),
  sendAccountDeletionOtpEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendMail: vi.fn(async () => {}),
}));

const emailA = `resident-a-${h.runId}@test.local`;
const phoneA = `+9190000${h.runId.slice(-5)}`;
const password = "test-password-123";

let societyId: string;
let flatId: string;
let adminId: string;
let registeredSocietyId: string | undefined;
// Users created directly in tests (e.g. the deletion cases) whose emails may be
// nulled or use a non-@test.local domain, so the email-based sweep won't find
// them — cleaned up by id in afterAll.
const extraUserIds: string[] = [];

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

/** Log in and assert a straight-through session (no OTP gate). */
async function loginSession(identifier: string, pwd = password) {
  const result = await authService.login({ identifier, password: pwd });
  if (result.status !== "SUCCESS") {
    throw new Error(`expected SUCCESS login, got ${result.status}`);
  }
  return result.session;
}

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  // Echo OTP codes in results so the email-verification flow is testable.
  process.env.OTP_DEV_ECHO = "true";

  const society = await prisma.society.create({
    data: {
      name: `Test Society ${h.runId}`,
      address: "1 Test Lane",
      city: "Testville",
      state: "TS",
      pincode: "000000",
    },
  });
  societyId = society.id;

  const tower = await prisma.tower.create({
    data: { societyId, name: `T-${h.runId}` },
  });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "T-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;

  const admin = await prisma.user.create({
    data: {
      name: "Test Admin",
      email: `admin-${h.runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });
  adminId = admin.id;

  await prisma.pendingResidentInvite.createMany({
    data: [
      { societyId, flatId, email: emailA, invitedByAdminId: adminId },
      { societyId, flatId, email: h.googleEmail, invitedByAdminId: adminId },
    ],
  });
});

afterAll(async () => {
  // Remove everything this run created (dev database, keyed by runId).
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@test.local", contains: h.runId } },
    select: { id: true },
  });
  const userIds = [...new Set([...users.map((u) => u.id), ...extraUserIds])];
  await prisma.emailOtp.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.adminProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pendingResidentInvite.deleteMany({ where: { societyId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { id: flatId } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  // Society created by the registerSociety test (its admin was removed above).
  if (registeredSocietyId) {
    await prisma.society.deleteMany({ where: { id: registeredSocietyId } });
  }
  await prisma.$disconnect();
});

describe("signup", () => {
  it("rejects when the email is missing", async () => {
    await expectTRPCError(
      authService.signup({ name: "X", password } as never),
      "BAD_REQUEST",
    );
  });

  it("creates a society-less unverified account when no invite matches, and challenges for the OTP", async () => {
    // The no-society gate: signing up is open; the society comes later via an
    // admin invite or an approved join request.
    const email = `uninvited-${h.runId}@test.local`;
    const challenge = await authService.signup({
      name: "No Invite",
      email,
      password,
    });
    expect(challenge.status).toBe("OTP_REQUIRED");
    expect(challenge.email).toBe(email);
    expect(challenge.devCode).toMatch(/^\d{6}$/);

    const created = await prisma.user.findUnique({
      where: { email },
      include: { residentProfile: true },
    });
    expect(created?.role).toBe("RESIDENT");
    expect(created?.societyId).toBeNull();
    expect(created?.emailVerified).toBe(false);
    // No flat yet, so no resident profile either.
    expect(created?.residentProfile).toBeNull();

    // The emailed code is what logs them in.
    const session = await authService.verifyEmailOtp({
      email,
      code: challenge.devCode!,
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.user.societyId).toBeNull();
  });

  it("creates a resident linked to the invited flat, claims the invite, and challenges for the OTP", async () => {
    const challenge = await authService.signup({
      name: "Resident A",
      email: emailA,
      password,
    });
    expect(challenge.status).toBe("OTP_REQUIRED");
    expect(challenge.email).toBe(emailA);

    const created = await prisma.user.findUnique({
      where: { email: emailA },
      include: { residentProfile: true },
    });
    expect(created?.role).toBe("RESIDENT");
    expect(created?.residentProfile?.flatId).toBe(flatId);
    // Left unverified here: the login suite below exercises the OTP gate.
    expect(created?.emailVerified).toBe(false);

    const invite = await prisma.pendingResidentInvite.findFirst({
      where: { email: emailA },
    });
    expect(invite?.status).toBe("CLAIMED");
  });

  it("rejects a duplicate signup", async () => {
    await expectTRPCError(
      authService.signup({ name: "Dup", email: emailA, password }),
      "CONFLICT",
    );
  });
});

describe("registerSociety", () => {
  const founderEmail = `founder-${h.runId}@test.local`;

  it("rejects when the admin has neither email nor phone", async () => {
    await expectTRPCError(
      authService.registerSociety({
        society: {
          name: `New Society ${h.runId}`,
          address: "1 Founder St",
          city: "Newtown",
          state: "NT",
          pincode: "111111",
        },
        admin: { name: "Founder", password } as never,
      }),
      "BAD_REQUEST",
    );
  });

  it("creates the society and a linked ADMIN, returning a session", async () => {
    const session = await authService.registerSociety({
      society: {
        name: `New Society ${h.runId}`,
        address: "1 Founder St",
        city: "Newtown",
        state: "NT",
        pincode: "111111",
      },
      admin: {
        name: "Founder",
        email: founderEmail,
        password,
        designation: "Chairperson",
      },
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.role).toBe("ADMIN");

    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { adminProfile: true },
    });
    expect(admin?.role).toBe("ADMIN");
    expect(admin?.societyId).toBeTruthy();
    expect(admin?.adminProfile?.designation).toBe("Chairperson");
    registeredSocietyId = admin!.societyId!;

    const society = await prisma.society.findUnique({
      where: { id: registeredSocietyId },
    });
    expect(society?.name).toBe(`New Society ${h.runId}`);
  });

  it("rejects a duplicate admin email", async () => {
    await expectTRPCError(
      authService.registerSociety({
        society: {
          name: `Another Society ${h.runId}`,
          address: "2 Founder St",
          city: "Newtown",
          state: "NT",
          pincode: "111111",
        },
        admin: { name: "Dup Founder", email: founderEmail, password },
      }),
      "CONFLICT",
    );
  });
});

describe("login", () => {
  it("logs in with phone directly (no OTP gate)", async () => {
    // Signup no longer takes a phone; attach one directly — the server-side
    // phone login path still exists (e.g. staff accounts created with phones).
    await prisma.user.update({
      where: { email: emailA },
      data: { phone: phoneA },
    });
    const result = await authService.login({ identifier: phoneA, password });
    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;
    expect(result.session.user.phone).toBe(phoneA);
  });

  it("gates an unverified-email login behind an OTP", async () => {
    const result = await authService.login({ identifier: emailA, password });
    expect(result.status).toBe("OTP_REQUIRED");
    if (result.status !== "OTP_REQUIRED") return;
    expect(result.channel).toBe("email");
    expect(result.email).toBe(emailA);
    expect(result.devCode).toMatch(/^\d{6}$/);
  });

  it("rejects a wrong OTP, then verifies with the right one and issues a session", async () => {
    const first = await authService.login({ identifier: emailA, password });
    if (first.status !== "OTP_REQUIRED") throw new Error("expected OTP_REQUIRED");
    const code = first.devCode!;
    const wrong = code === "000000" ? "111111" : "000000";

    await expectTRPCError(
      authService.verifyEmailOtp({ email: emailA, code: wrong }),
      "UNAUTHORIZED",
    );

    const session = await authService.verifyEmailOtp({ email: emailA, code });
    expect(session.user.email).toBe(emailA);

    const user = await prisma.user.findUnique({ where: { email: emailA } });
    expect(user?.emailVerified).toBe(true);
  });

  it("logs a now-verified email in directly", async () => {
    const result = await authService.login({ identifier: emailA, password });
    expect(result.status).toBe("SUCCESS");
  });

  it("never OTP-gates a hardcoded test account (.test email), even when unverified", async () => {
    const email = `demo-${h.runId}@example.test`;
    const user = await prisma.user.create({
      data: {
        name: "Demo Test",
        email,
        passwordHash: await hashPassword(password),
        role: "RESIDENT",
        emailVerified: false, // deliberately unverified — must still skip OTP
        societyId,
      },
    });

    const result = await authService.login({ identifier: email, password });
    expect(result.status).toBe("SUCCESS");

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("resendEmailOtp no-ops (no code) for an already-verified account", async () => {
    const res = await authService.resendEmailOtp({ email: emailA });
    expect(res.devCode).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    await expectTRPCError(
      authService.login({ identifier: emailA, password: "wrong" }),
      "UNAUTHORIZED",
    );
  });

  it("rejects an unknown identifier", async () => {
    await expectTRPCError(
      authService.login({ identifier: "nobody@test.local", password }),
      "UNAUTHORIZED",
    );
  });
});

describe("google login", () => {
  it("rejects an invalid ID token", async () => {
    await expectTRPCError(
      authService.googleLogin({ idToken: "garbage" }),
      "UNAUTHORIZED",
    );
  });

  it("creates a Google user from a matching invite, then logs the same user in", async () => {
    const first = await authService.googleLogin({
      idToken: `valid:${h.googleEmail}`,
    });
    expect(first.user.email).toBe(h.googleEmail);

    const created = await prisma.user.findUnique({
      where: { id: first.user.id },
    });
    expect(created?.authProvider).toBe("GOOGLE");
    expect(created?.passwordHash).toBeNull();

    const second = await authService.googleLogin({
      idToken: `valid:${h.googleEmail}`,
    });
    expect(second.user.id).toBe(first.user.id);
  });

  // Must run before the linking case below: once emailA is Google-linked, its
  // sub resolves by googleId and the email_verified guard is never reached.
  it("refuses to link when Google has not verified the email", async () => {
    await expectTRPCError(
      authService.googleLogin({ idToken: `unverified:${emailA}` }),
      "CONFLICT",
    );
  });

  it("links Google onto an existing password account and logs it in", async () => {
    const session = await authService.googleLogin({
      idToken: `valid:${emailA}`,
    });
    expect(session.user.email).toBe(emailA);

    const linked = await prisma.user.findUnique({ where: { email: emailA } });
    expect(linked?.googleId).toBe(`gsub-${emailA}`);
    expect(linked?.emailVerified).toBe(true);
    // The password is untouched — both sign-in methods now work.
    expect(linked?.passwordHash).toBeTruthy();
    const viaPassword = await authService.login({ identifier: emailA, password });
    expect(viaPassword.status).toBe("SUCCESS");
  });

  it("creates a society-less account for a Google login with no matching invite", async () => {
    const session = await authService.googleLogin({
      idToken: `valid:stranger-${h.runId}@test.local`,
    });
    expect(session.user.societyId).toBeNull();
    expect(session.user.role).toBe("RESIDENT");
  });
});

describe("refresh rotation", () => {
  it("rotates tokens and detects reuse of the old token", async () => {
    const session = await loginSession(emailA);

    const rotated = await authService.refreshSession({
      refreshToken: session.refreshToken,
    });
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    // Reusing the already-rotated token must fail AND revoke all sessions.
    await expectTRPCError(
      authService.refreshSession({ refreshToken: session.refreshToken }),
      "UNAUTHORIZED",
    );
    await expectTRPCError(
      authService.refreshSession({ refreshToken: rotated.refreshToken }),
      "UNAUTHORIZED",
    );
  });

  it("rejects a made-up refresh token", async () => {
    await expectTRPCError(
      authService.refreshSession({ refreshToken: "not-a-real-token" }),
      "UNAUTHORIZED",
    );
  });
});

describe("logout", () => {
  it("revokes the presented refresh token", async () => {
    const session = await loginSession(emailA);
    await authService.logout({ refreshToken: session.refreshToken });
    await expectTRPCError(
      authService.refreshSession({ refreshToken: session.refreshToken }),
      "UNAUTHORIZED",
    );
  });

  it("logoutAll revokes every active session", async () => {
    const a = await loginSession(emailA);
    const b = await loginSession(emailA);
    const revoked = await authService.logoutAll(a.user.id);
    expect(revoked).toBeGreaterThanOrEqual(2);
    await expectTRPCError(
      authService.refreshSession({ refreshToken: b.refreshToken }),
      "UNAUTHORIZED",
    );
  });
});

describe("password reset", () => {
  it("resets the password, revokes sessions, and burns the token", async () => {
    const before = await loginSession(emailA);
    const user = await prisma.user.findUnique({ where: { email: emailA } });
    const token = signPasswordResetToken(user!);

    await authService.resetPassword({ token, newPassword: "new-password-456" });

    // Old password no longer works; new one does.
    await expectTRPCError(
      authService.login({ identifier: emailA, password }),
      "UNAUTHORIZED",
    );
    const after = await loginSession(emailA, "new-password-456");
    expect(after.user.id).toBe(before.user.id);

    // Sessions from before the reset are dead.
    await expectTRPCError(
      authService.refreshSession({ refreshToken: before.refreshToken }),
      "UNAUTHORIZED",
    );

    // The reset token is single-use (bound to the old password hash).
    await expectTRPCError(
      authService.resetPassword({ token, newPassword: "another-789" }),
      "UNAUTHORIZED",
    );
  });

  it("request never reveals whether the account exists", async () => {
    await expect(
      authService.requestPasswordReset({ email: "ghost@test.local" }),
    ).resolves.toBeUndefined();
  });
});

describe("account deletion", () => {
  const deleteEmail = `delete-me-${h.runId}@test.local`;
  const demoEmail = `demo-del-${h.runId}@example.test`;

  it("blocks deletion for demo/test accounts (request and confirm)", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Demo Del",
        email: demoEmail,
        passwordHash: await hashPassword(password),
        role: "RESIDENT",
        emailVerified: true,
        societyId,
      },
    });
    extraUserIds.push(user.id);

    const res = await authService.requestAccountDeletion({ email: demoEmail });
    expect(res.status).toBe("DEMO_BLOCKED");

    // Confirm refuses demo accounts outright, before any code check.
    await expectTRPCError(
      authService.confirmAccountDeletion({ email: demoEmail, code: "000000" }),
      "FORBIDDEN",
    );

    // The demo account is untouched.
    const still = await prisma.user.findUnique({ where: { id: user.id } });
    expect(still?.isActive).toBe(true);
    expect(still?.email).toBe(demoEmail);
  });

  it("reports OTP_SENT without a code for an unknown email (no enumeration)", async () => {
    const res = await authService.requestAccountDeletion({
      email: `ghost-${h.runId}@test.local`,
    });
    expect(res.status).toBe("OTP_SENT");
    if (res.status !== "OTP_SENT") return;
    expect(res.devCode).toBeUndefined();
  });

  it("emails a code, rejects a wrong one, then soft-deletes on the right code", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Delete Me",
        email: deleteEmail,
        phone: `+9199999${h.runId.slice(-5)}`,
        passwordHash: await hashPassword(password),
        role: "RESIDENT",
        emailVerified: true,
        societyId,
      },
    });
    extraUserIds.push(user.id);

    // An active session that the deletion must revoke.
    const session = await loginSession(deleteEmail);

    const req = await authService.requestAccountDeletion({ email: deleteEmail });
    expect(req.status).toBe("OTP_SENT");
    if (req.status !== "OTP_SENT") return;
    const code = req.devCode!;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === "000000" ? "111111" : "000000";
    await expectTRPCError(
      authService.confirmAccountDeletion({ email: deleteEmail, code: wrong }),
      "UNAUTHORIZED",
    );

    await authService.confirmAccountDeletion({ email: deleteEmail, code });

    // Row is anonymized + deactivated; unique identifiers are freed.
    const deleted = await prisma.user.findUnique({ where: { id: user.id } });
    expect(deleted?.isActive).toBe(false);
    expect(deleted?.email).toBeNull();
    expect(deleted?.phone).toBeNull();
    expect(deleted?.passwordHash).toBeNull();
    expect(deleted?.name).toBe("Deleted user");

    // The pre-deletion session is dead.
    await expectTRPCError(
      authService.refreshSession({ refreshToken: session.refreshToken }),
      "UNAUTHORIZED",
    );
  });
});
