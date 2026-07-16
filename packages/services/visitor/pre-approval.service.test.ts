import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

// The repo .env carries live SMTP credentials, so creating a pass with a guest
// email would otherwise send real mail from the test suite.
const sentPasses = vi.hoisted(
  () => [] as { to: string; qrCode: string; hostName: string; flatLabel: string }[],
);
vi.mock("@repo/mailer", () => ({
  isMailerConfigured: () => false,
  sendGuestPassEmail: vi.fn(async (p: (typeof sentPasses)[number]) => {
    sentPasses.push(p);
  }),
  sendOtpEmail: vi.fn(async () => {}),
  sendAccountDeletionOtpEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendMail: vi.fn(async () => {}),
}));

import * as preApprovalService from "./pre-approval.service";

const runId = `pre-${Date.now().toString(36)}`;

let societyId: string;
let otherSocietyId: string;
let flatId: string;
let guard: User;
let otherGuard: User;
let resident: User;
let otherResident: User;

const inWindow = () => ({
  validFrom: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
  validTo: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
});

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
      name: `Pre Society ${runId}`,
      address: "1 Pre St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const otherSociety = await prisma.society.create({
    data: {
      name: `Pre Other ${runId}`,
      address: "2 Pre St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  otherSocietyId = otherSociety.id;

  const tower = await prisma.tower.create({ data: { societyId, name: `PA-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "PA-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;
  const flat2 = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "PA-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "GUARD" | "RESIDENT", sid: string, flat?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flat ? { residentProfile: { create: { flatId: flat } } } : {}),
      },
    });

  guard = await mkUser("Pre Guard", "GUARD", societyId);
  otherGuard = await mkUser("Pre Other Guard", "GUARD", otherSocietyId);
  resident = await mkUser("Pre Resident", "RESIDENT", societyId, flatId);
  otherResident = await mkUser("Pre Other Resident", "RESIDENT", societyId, flat2.id);
});

afterAll(async () => {
  const societyIds = [societyId, otherSocietyId];
  await prisma.visitor.deleteMany({ where: { flat: { tower: { societyId: { in: societyIds } } } } });
  await prisma.guestPreApproval.deleteMany({
    where: { flat: { tower: { societyId: { in: societyIds } } } },
  });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("create", () => {
  it("rejects an inverted or past window", async () => {
    const now = Date.now();
    await expectTRPCError(
      preApprovalService.createPreApproval(resident, {
        guestName: "G",
        guestPhone: "+919900000010",
        validFrom: new Date(now + 60_000).toISOString(),
        validTo: new Date(now).toISOString(),
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      preApprovalService.createPreApproval(resident, {
        guestName: "G",
        guestPhone: "+919900000010",
        validFrom: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        validTo: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
      "BAD_REQUEST",
    );
  });

  it("creates an ACTIVE pre-approval with a QR token linked to the resident's flat", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest One",
      guestPhone: "+919900000011",
      ...inWindow(),
    });
    expect(pre.status).toBe("ACTIVE");
    expect(pre.qrCode).toMatch(/^[0-9a-f]{32}$/);
    expect(pre.flatId).toBe(flatId);
  });
});

describe("verify (happy path)", () => {
  it("marks the pre-approval USED and creates an already-APPROVED visitor", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Two",
      guestPhone: "+919900000012",
      vehicleNumber: "KA-99-PRE",
      ...inWindow(),
    });

    const { preApproval, visitor } = await preApprovalService.verifyPreApproval(guard, {
      qrCode: pre.qrCode,
    });
    expect(preApproval.status).toBe("USED");
    expect(visitor.status).toBe("APPROVED");
    expect(visitor.purpose).toBe("GUEST");
    expect(visitor.name).toBe("Guest Two");
    expect(visitor.vehicleNumber).toBe("KA-99-PRE");
    expect(visitor.flatId).toBe(flatId);
    expect(visitor.registeredByGuard.id).toBe(guard.id);
    expect(visitor.actionedByResident?.id).toBe(resident.id);
  });

  it("a second verify of the same token is rejected", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Three",
      guestPhone: "+919900000013",
      ...inWindow(),
    });
    await preApprovalService.verifyPreApproval(guard, { qrCode: pre.qrCode });
    await expectTRPCError(
      preApprovalService.verifyPreApproval(guard, { qrCode: pre.qrCode }),
      "CONFLICT",
    );
  });
});

describe("verify (failure paths)", () => {
  it("unknown tokens and other-society tokens are NOT_FOUND", async () => {
    await expectTRPCError(
      preApprovalService.verifyPreApproval(guard, { qrCode: "deadbeef".repeat(4) }),
      "NOT_FOUND",
    );

    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Four",
      guestPhone: "+919900000014",
      ...inWindow(),
    });
    await expectTRPCError(
      preApprovalService.verifyPreApproval(otherGuard, { qrCode: pre.qrCode }),
      "NOT_FOUND",
    );
  });

  it("a not-yet-valid window is rejected", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Five",
      guestPhone: "+919900000015",
      validFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      validTo: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await expectTRPCError(
      preApprovalService.verifyPreApproval(guard, { qrCode: pre.qrCode }),
      "CONFLICT",
    );
  });

  it("a lapsed window is rejected and flipped to EXPIRED", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Six",
      guestPhone: "+919900000016",
      ...inWindow(),
    });
    // Lapse the window after creation.
    await prisma.guestPreApproval.update({
      where: { id: pre.id },
      data: { validTo: new Date(Date.now() - 60_000) },
    });

    await expectTRPCError(
      preApprovalService.verifyPreApproval(guard, { qrCode: pre.qrCode }),
      "CONFLICT",
    );
    const row = await prisma.guestPreApproval.findUnique({ where: { id: pre.id } });
    expect(row?.status).toBe("EXPIRED");
  });
});

describe("cancel", () => {
  it("resident cancels an own ACTIVE pre-approval; its QR stops working", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Seven",
      guestPhone: "+919900000017",
      ...inWindow(),
    });
    const cancelled = await preApprovalService.cancelPreApproval(resident, {
      preApprovalId: pre.id,
    });
    expect(cancelled.status).toBe("CANCELLED");

    await expectTRPCError(
      preApprovalService.verifyPreApproval(guard, { qrCode: pre.qrCode }),
      "CONFLICT",
    );
    await expectTRPCError(
      preApprovalService.cancelPreApproval(resident, { preApprovalId: pre.id }),
      "CONFLICT",
    );
  });

  it("cannot cancel another resident's pre-approval", async () => {
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Eight",
      guestPhone: "+919900000018",
      ...inWindow(),
    });
    await expectTRPCError(
      preApprovalService.cancelPreApproval(otherResident, { preApprovalId: pre.id }),
      "NOT_FOUND",
    );
  });
});

describe("lapse sweep", () => {
  it("expireLapsedPreApprovals flips only lapsed ACTIVE rows", async () => {
    const lapsing = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Nine",
      guestPhone: "+919900000019",
      ...inWindow(),
    });
    await prisma.guestPreApproval.update({
      where: { id: lapsing.id },
      data: { validTo: new Date(Date.now() - 60_000) },
    });
    const fresh = await preApprovalService.createPreApproval(resident, {
      guestName: "Guest Ten",
      guestPhone: "+919900000020",
      ...inWindow(),
    });

    const count = await preApprovalService.expireLapsedPreApprovals();
    expect(count).toBeGreaterThanOrEqual(1);

    const lapsedRow = await prisma.guestPreApproval.findUnique({ where: { id: lapsing.id } });
    expect(lapsedRow?.status).toBe("EXPIRED");
    const freshRow = await prisma.guestPreApproval.findUnique({ where: { id: fresh.id } });
    expect(freshRow?.status).toBe("ACTIVE");
  });
});

describe("emailing the pass to the guest", () => {
  const future = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

  it("emails the QR and code when a guest email is given", async () => {
    sentPasses.length = 0;
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Emailed Guest",
      guestPhone: "9876500011",
      guestEmail: "guest@example.test",
      validFrom: future(5),
      validTo: future(120),
    });

    expect(pre.guestEmail).toBe("guest@example.test");
    expect(sentPasses).toHaveLength(1);
    expect(sentPasses[0]!.to).toBe("guest@example.test");
    // The guard scans exactly what the pass stores.
    expect(sentPasses[0]!.qrCode).toBe(pre.qrCode);
    expect(sentPasses[0]!.hostName).toBe(resident.name);
  });

  it("sends nothing when no guest email is given", async () => {
    sentPasses.length = 0;
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Quiet Guest",
      guestPhone: "9876500012",
      validFrom: future(5),
      validTo: future(120),
    });
    expect(pre.guestEmail).toBeNull();
    expect(sentPasses).toHaveLength(0);
  });

  it("a mail failure does not fail the pass", async () => {
    const mailer = await import("@repo/mailer");
    vi.mocked(mailer.sendGuestPassEmail).mockRejectedValueOnce(new Error("SMTP down"));

    // The pass is what matters — the resident can always show the QR in-app.
    const pre = await preApprovalService.createPreApproval(resident, {
      guestName: "Undeliverable Guest",
      guestPhone: "9876500013",
      guestEmail: "bounce@example.test",
      validFrom: future(5),
      validTo: future(120),
    });
    expect(pre.status).toBe("ACTIVE");
    expect(pre.qrCode).toBeTruthy();
  });
});
