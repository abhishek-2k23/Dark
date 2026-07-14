import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { signPasswordResetToken } from "@repo/auth";

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
// that email; anything else is rejected — mirrors google-auth-library's API.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      if (!idToken.startsWith("valid:")) throw new Error("invalid token");
      const email = idToken.slice("valid:".length);
      return {
        getPayload: () => ({
          sub: `gsub-${email}`,
          email,
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
  const userIds = users.map((u) => u.id);
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
  it("rejects when neither email nor phone is given", async () => {
    await expectTRPCError(
      authService.signup({ name: "X", password } as never),
      "BAD_REQUEST",
    );
  });

  it("rejects when no invite matches", async () => {
    await expectTRPCError(
      authService.signup({
        name: "No Invite",
        email: `uninvited-${h.runId}@test.local`,
        password,
      }),
      "FORBIDDEN",
    );
  });

  it("creates a resident linked to the invited flat and claims the invite", async () => {
    const session = await authService.signup({
      name: "Resident A",
      email: emailA,
      phone: phoneA,
      password,
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.role).toBe("RESIDENT");

    const profile = await prisma.residentProfile.findUnique({
      where: { userId: session.user.id },
    });
    expect(profile?.flatId).toBe(flatId);

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

  it("rejects a Google login whose email belongs to a password account", async () => {
    await expectTRPCError(
      authService.googleLogin({ idToken: `valid:${emailA}` }),
      "CONFLICT",
    );
  });

  it("rejects a Google login with no matching invite", async () => {
    await expectTRPCError(
      authService.googleLogin({ idToken: `valid:stranger-${h.runId}@test.local` }),
      "FORBIDDEN",
    );
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
