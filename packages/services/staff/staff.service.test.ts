import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as staffService from "./staff.service";
import * as authService from "../auth/auth.service";

const runId = `stf-${Date.now().toString(36)}`;

let societyId: string;
let admin: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `Staff Society ${runId}`,
      address: "1 Staff St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  admin = await prisma.user.create({
    data: {
      name: "Staff Admin",
      email: `staff-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { societyId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.guardProfile.deleteMany({ where: { societyId } });
  await prisma.adminProfile.deleteMany({ where: { societyId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("staffAccount.create", () => {
  it("rejects when neither email nor phone is given", async () => {
    await expectTRPCError(
      staffService.createStaffAccount(admin, {
        name: "No Id",
        temporaryPassword: "temp-pass-123",
        role: "GUARD",
      }),
      "BAD_REQUEST",
    );
  });

  it("creates a guard with a guard profile who can log in", async () => {
    const email = `guard-${runId}@test.local`;
    const created = await staffService.createStaffAccount(admin, {
      name: "Gate Guard",
      email,
      temporaryPassword: "temp-pass-123",
      role: "GUARD",
      gateAssigned: "Gate 1",
      shiftStart: "06:00",
      shiftEnd: "14:00",
    });
    expect(created.role).toBe("GUARD");

    const profile = await prisma.guardProfile.findUnique({
      where: { userId: created.id },
    });
    expect(profile?.gateAssigned).toBe("Gate 1");
    expect(profile?.societyId).toBe(societyId);

    // Verify the email so the login returns a session rather than an OTP prompt.
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });
    const login = await authService.login({
      identifier: email,
      password: "temp-pass-123",
    });
    if (login.status !== "SUCCESS") throw new Error("expected a session");
    expect(login.session.user.role).toBe("GUARD");
  });

  it("creates an admin with an admin profile", async () => {
    const created = await staffService.createStaffAccount(admin, {
      name: "Second Admin",
      email: `admin2-${runId}@test.local`,
      temporaryPassword: "temp-pass-123",
      role: "ADMIN",
      designation: "TREASURER",
    });
    const profile = await prisma.adminProfile.findUnique({
      where: { userId: created.id },
    });
    expect(profile?.designation).toBe("TREASURER");
  });

  it("rejects a duplicate email", async () => {
    await expectTRPCError(
      staffService.createStaffAccount(admin, {
        name: "Dup",
        email: `guard-${runId}@test.local`,
        temporaryPassword: "temp-pass-123",
        role: "GUARD",
      }),
      "CONFLICT",
    );
  });

  it("rejects an admin with no society link", async () => {
    await expectTRPCError(
      staffService.createStaffAccount(
        { ...admin, societyId: null },
        {
          name: "X",
          email: `x-${runId}@test.local`,
          temporaryPassword: "temp-pass-123",
          role: "GUARD",
        },
      ),
      "PRECONDITION_FAILED",
    );
  });
});
