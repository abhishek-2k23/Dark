import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as residentService from "./resident.service";
import * as authService from "../auth/auth.service";

// Signup emails a verification OTP; stub the mailer so this suite never
// touches SMTP (the repo .env may carry real credentials).
vi.mock("@repo/mailer", () => ({
  isMailerConfigured: () => false,
  sendOtpEmail: vi.fn(async () => {}),
  sendAccountDeletionOtpEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendMail: vi.fn(async () => {}),
}));

const runId = `res-${Date.now().toString(36)}`;
const inviteeEmail = `invitee-${runId}@test.local`;
const password = "test-password-123";

let societyId: string;
let otherSocietyId: string;
let towerId: string;
let flatId: string;
let otherFlatId: string;
let admin: User;
let otherAdmin: User;

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
      name: `Res Society ${runId}`,
      address: "1 Res St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const other = await prisma.society.create({
    data: {
      name: `Res Other ${runId}`,
      address: "2 Res St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  otherSocietyId = other.id;

  const tower = await prisma.tower.create({ data: { societyId, name: `RT-${runId}` } });
  towerId = tower.id;
  const flat = await prisma.flat.create({
    data: { towerId, flatNumber: "R-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;
  const otherTower = await prisma.tower.create({
    data: { societyId: otherSocietyId, name: `RT-${runId}` },
  });
  const otherFlat = await prisma.flat.create({
    data: { towerId: otherTower.id, flatNumber: "R-101", floor: 1, type: "TWO_BHK" },
  });
  otherFlatId = otherFlat.id;

  admin = await prisma.user.create({
    data: {
      name: "Res Admin",
      email: `res-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });
  otherAdmin = await prisma.user.create({
    data: {
      name: "Res Other Admin",
      email: `res-other-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId: otherSocietyId,
    },
  });
});

afterAll(async () => {
  const societyIds = [societyId, otherSocietyId];
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.emailOtp.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pendingResidentInvite.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("resident.invite", () => {
  it("rejects an invite with neither email nor phone", async () => {
    await expectTRPCError(residentService.inviteResident(admin, { flatId }), "BAD_REQUEST");
  });

  it("rejects a flat outside the admin's society", async () => {
    await expectTRPCError(
      residentService.inviteResident(otherAdmin, { flatId, email: inviteeEmail }),
      "NOT_FOUND",
    );
  });

  it("rejects inviting an email that already has an account", async () => {
    await expectTRPCError(
      residentService.inviteResident(admin, { flatId, email: admin.email! }),
      "CONFLICT",
    );
  });

  it("creates an invite, and rejects a duplicate pending invite", async () => {
    const invite = await residentService.inviteResident(admin, {
      flatId,
      email: inviteeEmail,
    });
    expect(invite.status).toBe("PENDING");
    expect(invite.flatId).toBe(flatId);

    await expectTRPCError(
      residentService.inviteResident(admin, { flatId, email: inviteeEmail }),
      "CONFLICT",
    );
  });
});

describe("invite → signup auto-link (happy path)", () => {
  it("signs the invitee up as a RESIDENT linked to the invited flat", async () => {
    // Signup now answers with an email-OTP challenge instead of a session,
    // but the account + flat link are created up front.
    const challenge = await authService.signup({
      name: "Invited Resident",
      email: inviteeEmail,
      password,
    });
    expect(challenge.status).toBe("OTP_REQUIRED");

    const created = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      include: { residentProfile: true },
    });
    expect(created?.role).toBe("RESIDENT");
    expect(created?.residentProfile?.flatId).toBe(flatId);
    expect(created?.societyId).toBe(societyId);
    // The first resident into an empty flat owns it. Without this the flat
    // never counts as occupied and every "already taken" rule silently passes.
    expect(created?.residentProfile?.isPrimaryResident).toBe(true);

    const invite = await prisma.pendingResidentInvite.findFirst({
      where: { email: inviteeEmail },
    });
    expect(invite?.status).toBe("CLAIMED");
  });

  it("refuses to invite anyone else into that flat once it is claimed", async () => {
    await expectTRPCError(
      residentService.inviteResident(admin, {
        flatId,
        email: `second-${runId}@test.local`,
      }),
      "CONFLICT",
    );
  });
});

describe("resident.list", () => {
  it("lists and filters by flat, tower, and search", async () => {
    const byFlat = await residentService.listResidents(admin, {
      flatId,
      status: "ALL",
      limit: 20,
    });
    expect(byFlat.items).toHaveLength(1);
    expect(byFlat.items[0]!.email).toBe(inviteeEmail);
    expect(byFlat.items[0]!.towerId).toBe(towerId);

    const byTower = await residentService.listResidents(admin, {
      towerId,
      status: "ALL",
      limit: 20,
    });
    expect(byTower.items.map((r) => r.email)).toContain(inviteeEmail);

    const bySearch = await residentService.listResidents(admin, {
      search: "invited resident",
      status: "ALL",
      limit: 20,
    });
    expect(bySearch.items.map((r) => r.email)).toContain(inviteeEmail);
  });

  it("does not leak residents to another society's admin", async () => {
    const list = await residentService.listResidents(otherAdmin, {
      status: "ALL",
      limit: 20,
    });
    expect(list.items.map((r) => r.email)).not.toContain(inviteeEmail);
  });
});

describe("resident.deactivate / reactivate", () => {
  it("deactivates (revoking sessions), then reactivates", async () => {
    // Verify the email so login yields a session directly (not an OTP prompt).
    await prisma.user.update({
      where: { email: inviteeEmail },
      data: { emailVerified: true },
    });
    const login = await authService.login({ identifier: inviteeEmail, password });
    if (login.status !== "SUCCESS") throw new Error("expected a session");
    const session = login.session;
    const resident = await prisma.user.findUnique({ where: { email: inviteeEmail } });

    const off = await residentService.setResidentActive(admin, {
      userId: resident!.id,
      isActive: false,
    });
    expect(off.isActive).toBe(false);

    // Deactivation killed the session and blocks new logins.
    await expectTRPCError(
      authService.refreshSession({ refreshToken: session.refreshToken }),
      "UNAUTHORIZED",
    );
    await expectTRPCError(
      authService.login({ identifier: inviteeEmail, password }),
      "FORBIDDEN",
    );

    const inactiveList = await residentService.listResidents(admin, {
      status: "INACTIVE",
      limit: 20,
    });
    expect(inactiveList.items.map((r) => r.email)).toContain(inviteeEmail);

    const on = await residentService.setResidentActive(admin, {
      userId: resident!.id,
      isActive: true,
    });
    expect(on.isActive).toBe(true);
    const back = await authService.login({ identifier: inviteeEmail, password });
    if (back.status !== "SUCCESS") throw new Error("expected a session");
    expect(back.session.user.email).toBe(inviteeEmail);
  });

  it("cannot touch a resident of another society", async () => {
    const resident = await prisma.user.findUnique({ where: { email: inviteeEmail } });
    await expectTRPCError(
      residentService.setResidentActive(otherAdmin, {
        userId: resident!.id,
        isActive: false,
      }),
      "NOT_FOUND",
    );
  });
});

describe("resident.updateContact", () => {
  /** A contactless resident, the shape a bulk import leaves behind. */
  async function makeBlankResident(label: string) {
    return prisma.user.create({
      data: {
        name: `Blank ${label}`,
        role: "RESIDENT",
        societyId,
        importedAt: new Date(),
        residentProfile: { create: { flatId } },
      },
    });
  }

  it("fills in a missing email and phone", async () => {
    const resident = await makeBlankResident(`fill-${runId}`);
    const email = `filled-${runId}@test.local`;

    const updated = await residentService.updateResidentContact(admin, {
      userId: resident.id,
      email,
      phone: "9800000001",
    });

    expect(updated.email).toBe(email);
    expect(updated.phone).toBe("9800000001");

    // An admin typing an address is not proof of ownership, so the OTP gate
    // must survive it.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: resident.id } });
    expect(row.emailVerified).toBe(false);
  });

  it("lowercases the email so signup can match it", async () => {
    const resident = await makeBlankResident(`case-${runId}`);
    const updated = await residentService.updateResidentContact(admin, {
      userId: resident.id,
      email: `  MiXeD-${runId}@Test.Local `,
    });
    expect(updated.email).toBe(`mixed-${runId}@test.local`);
  });

  it("rejects an empty payload", async () => {
    const resident = await makeBlankResident(`empty-${runId}`);
    await expectTRPCError(
      residentService.updateResidentContact(admin, { userId: resident.id }),
      "BAD_REQUEST",
    );
  });

  /**
   * The fill-only rule. Overwriting an existing email would give any admin a
   * password-reset path into a resident's account.
   */
  it("refuses to overwrite a contact that is already set", async () => {
    const resident = await prisma.user.findUniqueOrThrow({ where: { email: inviteeEmail } });
    await expectTRPCError(
      residentService.updateResidentContact(admin, {
        userId: resident.id,
        email: `hijack-${runId}@test.local`,
      }),
      "CONFLICT",
    );
  });

  it("refuses a contact that belongs to another account", async () => {
    const resident = await makeBlankResident(`clash-${runId}`);
    await expectTRPCError(
      residentService.updateResidentContact(admin, {
        userId: resident.id,
        email: inviteeEmail,
      }),
      "CONFLICT",
    );
  });

  it("cannot touch a resident of another society", async () => {
    const resident = await makeBlankResident(`cross-${runId}`);
    await expectTRPCError(
      residentService.updateResidentContact(otherAdmin, {
        userId: resident.id,
        email: `cross-${runId}@test.local`,
      }),
      "NOT_FOUND",
    );
  });
});
