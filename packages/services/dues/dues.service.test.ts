import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as dueService from "./due.service";
import * as paymentService from "./payment.service";

const runId = `du-${Date.now().toString(36)}`;

let societyId: string;
let flatAId: string;
let admin: User;
let residentA: User;
let residentB: User;
let guard: User;

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
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

  const society = await prisma.society.create({
    data: {
      name: `DU Society ${runId}`,
      address: "1 DU St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `DU-${runId}` } });
  const flatA = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "DU-101", floor: 1, type: "TWO_BHK" },
  });
  flatAId = flatA.id;
  const flatB = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "DU-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "GUARD" | "RESIDENT" | "ADMIN", flatId?: string) =>
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

  admin = await mkUser("DU Admin", "ADMIN");
  residentA = await mkUser("DU Resident A", "RESIDENT", flatAId);
  residentB = await mkUser("DU Resident B", "RESIDENT", flatB.id);
  guard = await mkUser("DU Guard", "GUARD");
});

afterAll(async () => {
  await prisma.payment.deleteMany({
    where: { due: { flat: { tower: { societyId } } } },
  });
  await prisma.maintenanceDue.deleteMany({ where: { flat: { tower: { societyId } } } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("due generation", () => {
  it("creates one due per flat, and re-running skips existing ones", async () => {
    const first = await dueService.generateMonthly(admin, {
      month: 3,
      year: 2030,
      amount: 2500,
    });
    expect(first).toEqual({ created: 2, skipped: 0 });

    const rerun = await dueService.generateMonthly(admin, {
      month: 3,
      year: 2030,
      amount: 2500,
    });
    expect(rerun).toEqual({ created: 0, skipped: 2 });
  });

  it("defaults dueDate to the 10th of the billing month", async () => {
    const due = await prisma.maintenanceDue.findFirst({
      where: { flatId: flatAId, month: 3, year: 2030 },
    });
    expect(due?.dueDate.toISOString()).toBe("2030-03-10T00:00:00.000Z");
  });

  it("residents list only their flat's dues; admins the society's; guards get 403", async () => {
    const mine = await dueService.listDues(residentA, { limit: 50 });
    expect(mine.items.every((d) => d.flatId === flatAId)).toBe(true);
    expect(mine.items.length).toBe(1);

    const all = await dueService.listDues(admin, { limit: 50 });
    expect(all.items.length).toBe(2);

    await expectTRPCError(dueService.listDues(guard, { limit: 50 }), "FORBIDDEN");
  });

  it("markOverdueDues flips only past-dueDate PENDING dues", async () => {
    await dueService.generateMonthly(admin, {
      month: 1,
      year: 2020,
      amount: 1000,
      dueDate: "2020-01-10T00:00:00.000Z",
    });
    const flipped = await dueService.markOverdueDues();
    expect(flipped).toBeGreaterThanOrEqual(2);

    const overdue = await dueService.listDues(admin, {
      status: "OVERDUE",
      year: 2020,
      limit: 50,
    });
    expect(overdue.items.length).toBe(2);

    const future = await dueService.listDues(admin, { year: 2030, limit: 50 });
    expect(future.items.every((d) => d.status === "PENDING")).toBe(true);
  });
});

describe("payment flow", () => {
  let dueId: string;
  let paymentId: string;

  beforeAll(async () => {
    const due = await prisma.maintenanceDue.findFirst({
      where: { flatId: flatAId, month: 3, year: 2030 },
    });
    dueId = due!.id;
  });

  it("resident initiates a payment for their own due and gets a mock session", async () => {
    const { payment, gateway } = await paymentService.initiatePayment(residentA, {
      dueId,
      method: "UPI",
    });
    paymentId = payment.id;
    expect(payment.status).toBe("INITIATED");
    expect(payment.amount).toBe(2500);
    expect(gateway.provider).toBe("MOCK");
    expect(gateway.orderId).toContain(payment.id);
  });

  it("a resident cannot pay another flat's due", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(residentB, { dueId, method: "UPI" }),
      "NOT_FOUND",
    );
  });

  it("webhook with a bad signature is rejected", async () => {
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.success",
        paymentId,
        transactionId: `txn-${runId}`,
        signature: "f".repeat(64),
      }),
      "UNAUTHORIZED",
    );
    const untouched = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(untouched?.status).toBe("INITIATED");
  });

  it("payment.success marks the payment SUCCESS and the due PAID", async () => {
    const txn = `txn-${runId}`;
    const result = await paymentService.handleWebhook({
      event: "payment.success",
      paymentId,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.success",
        paymentId,
        transactionId: txn,
      }),
    });
    expect(result).toEqual({ paymentStatus: "SUCCESS", dueStatus: "PAID" });

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.paidAt).not.toBeNull();
    expect(payment?.transactionId).toBe(txn);
  });

  it("replaying the same webhook is an idempotent no-op", async () => {
    const txn = `txn-${runId}`;
    const before = await prisma.payment.findUnique({ where: { id: paymentId } });

    const replay = await paymentService.handleWebhook({
      event: "payment.success",
      paymentId,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.success",
        paymentId,
        transactionId: txn,
      }),
    });
    expect(replay).toEqual({ paymentStatus: "SUCCESS", dueStatus: "PAID" });

    const after = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(after?.paidAt?.toISOString()).toBe(before?.paidAt?.toISOString());
  });

  it("a conflicting event for a terminal payment is rejected", async () => {
    const txn = `txn-${runId}`;
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.failed",
        paymentId,
        transactionId: txn,
        signature: paymentService.signWebhookPayload({
          event: "payment.failed",
          paymentId,
          transactionId: txn,
        }),
      }),
      "CONFLICT",
    );
  });

  it("initiating a payment for a PAID due is rejected", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(residentA, { dueId, method: "CARD" }),
      "CONFLICT",
    );
  });

  it("payment.failed marks the payment FAILED and leaves the due payable", async () => {
    const dueB = await prisma.maintenanceDue.findFirst({
      where: { flat: { flatNumber: "DU-102" }, month: 3, year: 2030 },
    });
    const { payment } = await paymentService.initiatePayment(residentB, {
      dueId: dueB!.id,
      method: "NETBANKING",
    });

    const txn = `txn-fail-${runId}`;
    const result = await paymentService.handleWebhook({
      event: "payment.failed",
      paymentId: payment.id,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.failed",
        paymentId: payment.id,
        transactionId: txn,
      }),
    });
    expect(result.paymentStatus).toBe("FAILED");
    expect(result.dueStatus).toBe("PENDING");

    // The due can still be paid with a fresh attempt.
    const retry = await paymentService.initiatePayment(residentB, {
      dueId: dueB!.id,
      method: "UPI",
    });
    expect(retry.payment.status).toBe("INITIATED");
  });

  it("webhook for an unknown payment is NOT_FOUND", async () => {
    const txn = "txn-ghost";
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.success",
        paymentId: "ghost-payment",
        transactionId: txn,
        signature: paymentService.signWebhookPayload({
          event: "payment.success",
          paymentId: "ghost-payment",
          transactionId: txn,
        }),
      }),
      "NOT_FOUND",
    );
  });

  it("history lists every attempt of the caller, newest first", async () => {
    const history = await paymentService.paymentHistory(residentB, { limit: 50 });
    expect(history.items.length).toBe(2); // the FAILED attempt and the retry; rejected initiations create no row
    const statuses = history.items.map((p) => p.status);
    expect(statuses).toContain("FAILED");
    expect(statuses).toContain("INITIATED");

    const historyA = await paymentService.paymentHistory(residentA, { limit: 50 });
    expect(historyA.items.length).toBe(1);
    expect(historyA.items[0]!.status).toBe("SUCCESS");
  });
});

describe("offline payments", () => {
  // Pin the cloud name so receipt URLs are deterministic: the repo .env now
  // carries real Cloudinary credentials, and assertCloudinaryUrl validates
  // against whatever cloud is configured.
  const CLOUD = "test-cloud";
  const receipt = (n = 1) =>
    `https://res.cloudinary.com/${CLOUD}/image/upload/v1/receipts/r${n}.jpg`;
  let offlineDueId: string;

  beforeAll(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
    await dueService.generateMonthly(admin, { month: 7, year: 2031, amount: 1800 });
    const due = await prisma.maintenanceDue.findFirst({
      where: { flatId: flatAId, month: 7, year: 2031 },
    });
    offlineDueId = due!.id;
  });

  it("rejects a receipt URL that is not from our Cloudinary cloud", async () => {
    await expectTRPCError(
      paymentService.submitOfflinePayment(residentA, {
        dueId: offlineDueId,
        receiptUrl: "https://evil.example.com/receipt.jpg",
      }),
      "BAD_REQUEST",
    );
  });

  it("refuses OFFLINE at the gateway — it has no checkout", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(residentA, {
        dueId: offlineDueId,
        method: "OFFLINE",
      }),
      "BAD_REQUEST",
    );
  });

  it("a submitted receipt awaits verification and leaves the due payable", async () => {
    const payment = await paymentService.submitOfflinePayment(residentA, {
      dueId: offlineDueId,
      receiptUrl: receipt(),
      note: "Paid by cheque 4471 at the office",
    });
    expect(payment.method).toBe("OFFLINE");
    expect(payment.status).toBe("PENDING_VERIFICATION");
    expect(payment.receiptUrl).toBe(receipt());

    // The whole point: a receipt is a claim, not a settlement.
    const due = await prisma.maintenanceDue.findUnique({ where: { id: offlineDueId } });
    expect(due?.status).not.toBe("PAID");
  });

  it("refuses a second receipt while one is still awaiting a decision", async () => {
    await expectTRPCError(
      paymentService.submitOfflinePayment(residentA, {
        dueId: offlineDueId,
        receiptUrl: receipt(2),
      }),
      "CONFLICT",
    );
  });

  it("the gateway webhook cannot settle an offline payment", async () => {
    const pending = await prisma.payment.findFirst({
      where: { dueId: offlineDueId, status: "PENDING_VERIFICATION" },
    });
    const transactionId = `forged-${runId}`;
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.success",
        paymentId: pending!.id,
        transactionId,
        // Correctly signed: the point is that a valid signature still must not
        // approve a receipt that is waiting on a human.
        signature: paymentService.signWebhookPayload({
          event: "payment.success",
          paymentId: pending!.id,
          transactionId,
        }),
      }),
      "BAD_REQUEST",
    );
    const after = await prisma.payment.findUnique({ where: { id: pending!.id } });
    expect(after?.status).toBe("PENDING_VERIFICATION");
  });

  it("lists the receipt in the admin queue, scoped to the society", async () => {
    const queue = await paymentService.listPendingOfflinePayments(admin, { limit: 20 });
    const mine = queue.items.find((p) => p.dueId === offlineDueId);
    expect(mine).toBeDefined();
    expect(mine?.residentName).toBe("DU Resident A");
    expect(mine?.flatNumber).toBe("DU-101");
  });

  // Role gating (admin-only) is enforced by adminProcedure in the router and
  // covered in the trpc permissions suite; what the service owes us is
  // ownership scoping — a resident cannot pay someone else's flat's due.
  it("a resident cannot submit a receipt against another flat's due", async () => {
    await expectTRPCError(
      paymentService.submitOfflinePayment(residentB, {
        dueId: offlineDueId,
        receiptUrl: receipt(9),
      }),
      "NOT_FOUND",
    );
  });

  it("rejecting leaves the due payable and lets the resident try again", async () => {
    const pending = await prisma.payment.findFirst({
      where: { dueId: offlineDueId, status: "PENDING_VERIFICATION" },
    });
    const rejected = await paymentService.decideOfflinePayment(admin, {
      paymentId: pending!.id,
      approve: false,
      rejectionReason: "Receipt is unreadable",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Receipt is unreadable");

    const due = await prisma.maintenanceDue.findUnique({ where: { id: offlineDueId } });
    expect(due?.status).not.toBe("PAID");

    // The resident is told why, so they can fix it.
    const note = await prisma.notification.findFirst({
      where: { userId: residentA.id, type: "PAYMENT_REJECTED" },
    });
    expect(note?.body).toContain("unreadable");

    // And the block on re-submitting is lifted with the rejection.
    const retry = await paymentService.submitOfflinePayment(residentA, {
      dueId: offlineDueId,
      receiptUrl: receipt(3),
    });
    expect(retry.status).toBe("PENDING_VERIFICATION");
  });

  it("a second admin decision on a decided receipt conflicts", async () => {
    const decided = await prisma.payment.findFirst({
      where: { dueId: offlineDueId, status: "REJECTED" },
    });
    await expectTRPCError(
      paymentService.decideOfflinePayment(admin, {
        paymentId: decided!.id,
        approve: true,
      }),
      "CONFLICT",
    );
  });

  it("approving marks the payment SUCCESS and the due PAID together", async () => {
    const pending = await prisma.payment.findFirst({
      where: { dueId: offlineDueId, status: "PENDING_VERIFICATION" },
    });
    const approved = await paymentService.decideOfflinePayment(admin, {
      paymentId: pending!.id,
      approve: true,
    });
    expect(approved.status).toBe("SUCCESS");
    expect(approved.paidAt).not.toBeNull();
    expect(approved.verifiedAt).not.toBeNull();

    const due = await prisma.maintenanceDue.findUnique({ where: { id: offlineDueId } });
    expect(due?.status).toBe("PAID");

    const note = await prisma.notification.findFirst({
      where: { userId: residentA.id, type: "PAYMENT_VERIFIED" },
    });
    expect(note).not.toBeNull();
  });

  it("a paid due takes no further receipts", async () => {
    await expectTRPCError(
      paymentService.submitOfflinePayment(residentA, {
        dueId: offlineDueId,
        receiptUrl: receipt(4),
      }),
      "CONFLICT",
    );
  });
});
