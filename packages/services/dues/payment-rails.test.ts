import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as paymentService from "./payment.service";
import * as serviceBillService from "./service-bill.service";
import { buildUpiIntent, isValidVpa } from "./upi";

/**
 * The three payment rails and the polymorphic target, covering what the
 * pre-existing dues suite does not: UPI-direct, service bills, the gateway
 * eligibility guard, and the one-payment-in-flight rule across target kinds.
 */

const runId = `pr-${Date.now().toString(36)}`;

let paidSocietyId: string; // ACTIVE linked account + VPA
let barSocietyId: string; // no payout setup at all
let resident: User;
let barResident: User;
let admin: User;
let providerWithUpiId: string;
let providerNoUpiId: string;
let dueId: string;
let barDueId: string;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

async function makeSociety(label: string, payouts: boolean) {
  const society = await prisma.society.create({
    data: {
      name: `PR ${label} ${runId}`,
      address: "1 PR St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
      ...(payouts
        ? {
            razorpayAccountId: `acc_${label}_${runId}`,
            payoutStatus: "ACTIVE" as const,
            upiVpa: `pr${label}${runId.replace(/-/g, "")}@testbank`,
          }
        : {}),
    },
  });
  const tower = await prisma.tower.create({
    data: { societyId: society.id, name: `PR-${label}-${runId}` },
  });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: `PR-${label}-1`, floor: 1, type: "TWO_BHK" },
  });
  return { societyId: society.id, flatId: flat.id };
}

beforeAll(async () => {
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

  const paid = await makeSociety("paid", true);
  const bare = await makeSociety("bare", false);
  paidSocietyId = paid.societyId;
  barSocietyId = bare.societyId;

  const mkUser = (name: string, societyId: string, role: "RESIDENT" | "ADMIN", flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  resident = await mkUser("PR Resident", paidSocietyId, "RESIDENT", paid.flatId);
  admin = await mkUser("PR Admin", paidSocietyId, "ADMIN");
  barResident = await mkUser("PR Bare Resident", barSocietyId, "RESIDENT", bare.flatId);

  const withUpi = await prisma.serviceProvider.create({
    data: {
      societyId: paidSocietyId,
      name: `PR Maid ${runId}`,
      category: "MAID",
      phone: "9990000001",
      upiVpa: `prmaid${runId.replace(/-/g, "")}@testbank`,
      addedByAdminId: admin.id,
    },
  });
  providerWithUpiId = withUpi.id;

  const noUpi = await prisma.serviceProvider.create({
    data: {
      societyId: paidSocietyId,
      name: `PR Plumber ${runId}`,
      category: "PLUMBER",
      phone: "9990000002",
      addedByAdminId: admin.id,
    },
  });
  providerNoUpiId = noUpi.id;

  // dueDate must be in the future: dues.service.test.ts runs an overdue sweep
  // that flips *every* past-dueDate PENDING due in the database, and with the
  // suite running files in parallel it would otherwise reach these fixtures.
  const futureDueDate = new Date(Date.now() + 30 * 86_400_000);

  const due = await prisma.maintenanceDue.create({
    data: { flatId: paid.flatId, month: 7, year: 2026, amount: 2000, dueDate: futureDueDate },
  });
  dueId = due.id;

  const barDue = await prisma.maintenanceDue.create({
    data: { flatId: bare.flatId, month: 7, year: 2026, amount: 1500, dueDate: futureDueDate },
  });
  barDueId = barDue.id;
});

afterAll(async () => {
  const societyIds = [paidSocietyId, barSocietyId];
  await prisma.payment.deleteMany({
    where: {
      OR: [
        { due: { flat: { tower: { societyId: { in: societyIds } } } } },
        { serviceBill: { serviceProvider: { societyId: { in: societyIds } } } },
      ],
    },
  });
  await prisma.serviceBill.deleteMany({
    where: { serviceProvider: { societyId: { in: societyIds } } },
  });
  await prisma.serviceProvider.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.maintenanceDue.deleteMany({
    where: { flat: { tower: { societyId: { in: societyIds } } } },
  });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
});

describe("VPA validation", () => {
  it("accepts well-formed UPI ids and rejects malformed ones", () => {
    expect(isValidVpa("someone@okhdfc")).toBe(true);
    expect(isValidVpa("some.one-1_2@ybl")).toBe(true);
    expect(isValidVpa("no-at-sign")).toBe(false);
    expect(isValidVpa("@nolocal")).toBe(false);
    expect(isValidVpa("trailing@")).toBe(false);
    expect(isValidVpa("has space@bank")).toBe(false);
  });

  it("builds an intent with a normalised amount and a trimmed note", () => {
    const intent = buildUpiIntent({
      vpa: "someone@okhdfc",
      payeeName: "Test Society",
      amount: 1200.5,
      note: "7/2026 maintenance",
    });
    expect(intent.uri.startsWith("upi://pay?")).toBe(true);
    expect(intent.uri).toContain("pa=someone%40okhdfc");
    // Two decimals always — some PSP apps reject bare integers.
    expect(intent.uri).toContain("am=1200.50");
    expect(intent.uri).toContain("cu=INR");
    expect(intent.amount).toBe(1200.5);
  });

  it("truncates an over-long note rather than letting the PSP cut it mid-word", () => {
    const intent = buildUpiIntent({
      vpa: "someone@okhdfc",
      payeeName: "Test Society",
      amount: 10,
      note: "x".repeat(120),
    });
    expect(intent.note.length).toBeLessThanOrEqual(50);
    expect(intent.note.endsWith("...")).toBe(true);
  });
});

describe("rail eligibility", () => {
  it("offers gateway, UPI and offline for a society with an ACTIVE linked account and a VPA", async () => {
    const options = await paymentService.paymentOptions(resident, { kind: "DUE", id: dueId });
    expect(options).toMatchObject({
      targetKind: "DUE",
      amount: 2000,
      gateway: true,
      upiDirect: true,
      offline: true,
    });
  });

  it("closes the gateway and UPI rails for a society with no payout setup, leaving offline", async () => {
    const options = await paymentService.paymentOptions(barResident, {
      kind: "DUE",
      id: barDueId,
    });
    expect(options.gateway).toBe(false);
    expect(options.upiDirect).toBe(false);
    // Offline is the floor: it works with no payee setup at all, which is why
    // a society can onboard without touching payments.
    expect(options.offline).toBe(true);
  });

  it("refuses to mint a gateway session for a society that cannot receive gateway money", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(barResident, {
        kind: "DUE",
        id: barDueId,
        method: "UPI",
      }),
      "PRECONDITION_FAILED",
    );
  });

  it("never offers the gateway rail for a service person, however the bill is shaped", async () => {
    const bill = await serviceBillService.createBill(resident, {
      serviceProviderId: providerWithUpiId,
      amount: 500,
      periodLabel: "July 2026",
    });
    const options = await paymentService.paymentOptions(resident, {
      kind: "SERVICE_BILL",
      id: bill.id,
    });
    // A service person has no User and so can never complete Razorpay KYC.
    expect(options.gateway).toBe(false);
    expect(options.upiDirect).toBe(true);

    await expectTRPCError(
      paymentService.initiatePayment(resident, {
        kind: "SERVICE_BILL",
        id: bill.id,
        method: "CARD",
      }),
      "PRECONDITION_FAILED",
    );
  });

  it("closes the UPI rail for a service person with no VPA, leaving offline", async () => {
    const bill = await serviceBillService.createBill(resident, {
      serviceProviderId: providerNoUpiId,
      amount: 300,
    });
    const options = await paymentService.paymentOptions(resident, {
      kind: "SERVICE_BILL",
      id: bill.id,
    });
    expect(options.upiDirect).toBe(false);
    expect(options.offline).toBe(true);
    await expectTRPCError(
      paymentService.upiIntent(resident, { kind: "SERVICE_BILL", id: bill.id }),
      "PRECONDITION_FAILED",
    );
  });
});

describe("UPI-direct rail", () => {
  it("holds a due payment for verification and leaves the due payable meanwhile", async () => {
    const payment = await paymentService.submitUpiDirectPayment(resident, {
      kind: "DUE",
      id: dueId,
      utr: `UTR${runId}1`,
    });
    expect(payment.status).toBe("PENDING_VERIFICATION");
    expect(payment.method).toBe("UPI_DIRECT");
    expect(payment.upiUtr).toBe(`UTR${runId}1`);

    // A typed UTR is a claim, not a settlement — the due must stay payable.
    // Either payable status counts; what matters is that it is not PAID.
    const due = await prisma.maintenanceDue.findUnique({ where: { id: dueId } });
    expect(["PENDING", "OVERDUE"]).toContain(due!.status);
  });

  it("rejects a second payment while one is already in flight for the same target", async () => {
    await expectTRPCError(
      paymentService.submitUpiDirectPayment(resident, {
        kind: "DUE",
        id: dueId,
        utr: `UTR${runId}2`,
      }),
      "CONFLICT",
    );
    // …including across rails: the offline receipt must not sneak past either.
    // The URL has to be valid for the configured cloud, or assertCloudinaryUrl
    // rejects it first and we never reach the in-flight check we are testing.
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    await expectTRPCError(
      paymentService.submitOfflinePayment(resident, {
        kind: "DUE",
        id: dueId,
        receiptUrl: "https://res.cloudinary.com/test-cloud/image/upload/v1/receipts/r1.jpg",
      }),
      "CONFLICT",
    );
  });

  it("settles the due once an admin verifies the claim", async () => {
    const queue = await paymentService.listPendingPayments(admin, { limit: 50 });
    const mine = queue.items.find((p) => p.dueId === dueId);
    expect(mine).toBeDefined();
    expect(mine!.method).toBe("UPI_DIRECT");

    const approved = await paymentService.decideManualPayment(admin, {
      paymentId: mine!.id,
      approve: true,
    });
    expect(approved.status).toBe("SUCCESS");
    const due = await prisma.maintenanceDue.findUnique({ where: { id: dueId } });
    expect(due!.status).toBe("PAID");
  });
});

describe("service bills self-attest", () => {
  let billId: string;
  let paymentId: string;

  it("settles immediately on submission rather than queueing for an admin", async () => {
    const bill = await serviceBillService.createBill(resident, {
      serviceProviderId: providerWithUpiId,
      amount: 750,
      periodLabel: "August 2026",
    });
    billId = bill.id;

    const payment = await paymentService.submitUpiDirectPayment(resident, {
      kind: "SERVICE_BILL",
      id: billId,
      utr: `UTR${runId}S`,
    });
    paymentId = payment.id;

    // An admin cannot know whether a resident paid their maid, so gating this
    // on their approval would be theatre.
    expect(payment.status).toBe("SUCCESS");
    expect(payment.paidAt).not.toBeNull();
    const stored = await prisma.serviceBill.findUnique({ where: { id: billId } });
    expect(stored!.status).toBe("PAID");
  });

  it("does not put a self-attested payment in the admin verification queue", async () => {
    const queue = await paymentService.listPendingPayments(admin, { limit: 50 });
    expect(queue.items.find((p) => p.id === paymentId)).toBeUndefined();
  });

  it("lets an admin reverse it, returning the bill to payable", async () => {
    const reversed = await paymentService.reverseServicePayment(admin, {
      paymentId,
      reason: "Maid says she was not paid",
    });
    expect(reversed.status).toBe("REJECTED");
    expect(reversed.rejectionReason).toBe("Maid says she was not paid");

    const bill = await prisma.serviceBill.findUnique({ where: { id: billId } });
    expect(bill!.status).toBe("PENDING");
  });

  it("refuses to reverse the same payment twice", async () => {
    await expectTRPCError(
      paymentService.reverseServicePayment(admin, { paymentId, reason: "again" }),
      "CONFLICT",
    );
  });

  it("refuses to reverse a payment that is not against a service bill", async () => {
    const duePayment = await prisma.payment.findFirst({
      where: { dueId, status: "SUCCESS" },
      select: { id: true },
    });
    await expectTRPCError(
      paymentService.reverseServicePayment(admin, {
        paymentId: duePayment!.id,
        reason: "not allowed",
      }),
      "BAD_REQUEST",
    );
  });
});

describe("service bill scoping", () => {
  it("refuses to bill against a service person from another society", async () => {
    await expectTRPCError(
      serviceBillService.createBill(barResident, {
        serviceProviderId: providerWithUpiId,
        amount: 100,
      }),
      "NOT_FOUND",
    );
  });

  it("shows a resident only their own bills", async () => {
    const mine = await serviceBillService.listBills(resident, { limit: 50 });
    const theirs = await serviceBillService.listBills(barResident, { limit: 50 });
    expect(mine.items.length).toBeGreaterThan(0);
    expect(theirs.items.length).toBe(0);
  });

  it("shows an admin the whole society's bills, since reversal is their power", async () => {
    const seen = await serviceBillService.listBills(admin, { limit: 50 });
    expect(seen.items.length).toBeGreaterThan(0);
  });

  it("refuses to delete a bill that has payment attempts against it", async () => {
    const paid = await prisma.serviceBill.findFirst({
      where: { serviceProviderId: providerWithUpiId, payments: { some: {} } },
      select: { id: true },
    });
    await expectTRPCError(
      serviceBillService.deleteBill(resident, { billId: paid!.id }),
      "CONFLICT",
    );
  });

  it("deletes a clean bill raised in error", async () => {
    const bill = await serviceBillService.createBill(resident, {
      serviceProviderId: providerNoUpiId,
      amount: 42,
    });
    const deleted = await serviceBillService.deleteBill(resident, { billId: bill.id });
    expect(deleted.id).toBe(bill.id);
    expect(await prisma.serviceBill.findUnique({ where: { id: bill.id } })).toBeNull();
  });
});

describe("polymorphic target integrity", () => {
  it("rejects a payment with no target at the database level", async () => {
    const profile = await prisma.residentProfile.findFirst({
      where: { user: { id: resident.id } },
      select: { id: true },
    });
    await expect(
      prisma.payment.create({
        data: { residentId: profile!.id, amount: 1, method: "OFFLINE" },
      }),
    ).rejects.toThrow(/payment_exactly_one_target/);
  });

  it("rejects a payment against two targets at once", async () => {
    const profile = await prisma.residentProfile.findFirst({
      where: { user: { id: resident.id } },
      select: { id: true },
    });
    const bill = await prisma.serviceBill.findFirst({
      where: { serviceProviderId: providerWithUpiId },
      select: { id: true },
    });
    await expect(
      prisma.payment.create({
        data: {
          residentId: profile!.id,
          amount: 1,
          method: "OFFLINE",
          dueId,
          serviceBillId: bill!.id,
        },
      }),
    ).rejects.toThrow(/payment_exactly_one_target/);
  });

  it("filters payment history by target kind", async () => {
    const bills = await paymentService.paymentHistory(resident, {
      limit: 50,
      targetKind: "SERVICE_BILL",
    });
    expect(bills.items.length).toBeGreaterThan(0);
    expect(bills.items.every((p) => p.targetKind === "SERVICE_BILL")).toBe(true);
    expect(bills.items.every((p) => p.serviceBillId !== null)).toBe(true);

    const dues = await paymentService.paymentHistory(resident, {
      limit: 50,
      targetKind: "DUE",
    });
    expect(dues.items.every((p) => p.targetKind === "DUE")).toBe(true);
  });
});
