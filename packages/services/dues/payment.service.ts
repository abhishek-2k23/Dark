import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type PaymentMethod,
  type PaymentStatus,
  type DueStatus,
} from "@repo/database";
import { logger } from "@repo/logger";
import { assertCloudinaryUrl } from "@repo/cloudinary";

import {
  notifyUsers,
  societyAdminUserIds,
} from "../notification/notification.service";

/**
 * Payments against maintenance dues.
 *
 * MOCK GATEWAY: `initiatePayment` returns placeholder session data (no real
 * gateway is wired). Swapping in Razorpay/Stripe later means replacing
 * `mockGatewaySession` and the webhook signature scheme — the status flow
 * (INITIATED → SUCCESS/FAILED via webhook) stays identical.
 *
 * The webhook is signature-verified with an HMAC-SHA256 over
 * `event:paymentId:transactionId` using PAYMENT_WEBHOOK_SECRET, and is
 * idempotent: replaying a processed event is a no-op.
 */

const paymentInclude = {
  due: true,
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface PaymentInfo {
  id: string;
  dueId: string;
  dueMonth: number;
  dueYear: number;
  amount: number;
  method: PaymentMethod;
  transactionId: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  receiptUrl: string | null;
  note: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

function toPaymentInfo(payment: PaymentRow): PaymentInfo {
  return {
    id: payment.id,
    dueId: payment.dueId,
    dueMonth: payment.due.month,
    dueYear: payment.due.year,
    amount: Number(payment.amount),
    method: payment.method,
    transactionId: payment.transactionId,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    receiptUrl: payment.receiptUrl,
    note: payment.note,
    rejectionReason: payment.rejectionReason,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function webhookSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Payment webhooks are not configured on this server",
    });
  }
  return secret;
}

export type WebhookEvent = "payment.success" | "payment.failed";

/** Canonical webhook signature — exported so tests (and gateway simulators) can sign. */
export function signWebhookPayload(input: {
  event: WebhookEvent;
  paymentId: string;
  transactionId: string;
}): string {
  return crypto
    .createHmac("sha256", webhookSecret())
    .update(`${input.event}:${input.paymentId}:${input.transactionId}`)
    .digest("hex");
}

/** Mirrors the helper in due.service.ts — both scope admin reads by society. */
function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

async function actorResidentProfileId(actor: User): Promise<string> {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true, flatId: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile.id;
}

export interface GatewaySession {
  provider: "MOCK";
  orderId: string;
  checkoutUrl: string;
}

export async function initiatePayment(
  actor: User,
  input: { dueId: string; method: PaymentMethod },
): Promise<{ payment: PaymentInfo; gateway: GatewaySession }> {
  // OFFLINE is not a gateway method — it has no checkout and must never be
  // handed a session. It goes through submitOfflinePayment instead.
  if (input.method === "OFFLINE") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Offline payments are submitted with a receipt, not through the gateway",
    });
  }

  const residentProfile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true, flatId: true },
  });
  if (!residentProfile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }

  // Residents pay their own flat's dues only.
  const due = await prisma.maintenanceDue.findFirst({
    where: { id: input.dueId, flatId: residentProfile.flatId },
  });
  if (!due) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Due not found" });
  }
  if (due.status === "PAID") {
    throw new TRPCError({ code: "CONFLICT", message: "This due is already paid" });
  }

  const payment = await prisma.payment.create({
    data: {
      dueId: due.id,
      residentId: residentProfile.id,
      amount: due.amount,
      method: input.method,
    },
    include: paymentInclude,
  });

  // Placeholder session data; a real gateway would return its own order id
  // and checkout URL here.
  const gateway: GatewaySession = {
    provider: "MOCK",
    orderId: `mock_order_${payment.id}`,
    checkoutUrl: `https://mock-gateway.local/checkout/${payment.id}`,
  };

  return { payment: toPaymentInfo(payment), gateway };
}

/**
 * Gateway-facing webhook handler (public route, signature-verified).
 * Idempotent: a replayed event for an already-terminal payment with the same
 * transactionId returns the current state without re-applying anything.
 */
export async function handleWebhook(input: {
  event: WebhookEvent;
  paymentId: string;
  transactionId: string;
  signature: string;
}): Promise<{ paymentStatus: PaymentStatus; dueStatus: DueStatus }> {
  const expected = signWebhookPayload(input);
  const valid =
    input.signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(input.signature), Buffer.from(expected));
  if (!valid) {
    logger.info("Payment webhook rejected: bad signature", { paymentId: input.paymentId });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: paymentInclude,
  });
  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
  }

  // An offline payment has no gateway behind it, so any webhook naming one is
  // either a mistake or forged — it must never be able to self-approve a
  // receipt that is waiting on a human.
  if (payment.method === "OFFLINE") {
    logger.info("Payment webhook rejected: offline payment", { paymentId: payment.id });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Offline payments are not settled by the gateway",
    });
  }

  // Idempotency: same event replayed after processing is a no-op.
  if (payment.status !== "INITIATED") {
    const matchesProcessed =
      payment.transactionId === input.transactionId &&
      payment.status === (input.event === "payment.success" ? "SUCCESS" : "FAILED");
    if (matchesProcessed) {
      return { paymentStatus: payment.status, dueStatus: payment.due.status };
    }
    throw new TRPCError({
      code: "CONFLICT",
      message: `Payment is already ${payment.status}`,
    });
  }

  if (input.event === "payment.success") {
    const [updatedPayment, updatedDue] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          transactionId: input.transactionId,
          paidAt: new Date(),
        },
      }),
      prisma.maintenanceDue.update({
        where: { id: payment.dueId },
        data: { status: "PAID" },
      }),
    ]);
    return { paymentStatus: updatedPayment.status, dueStatus: updatedDue.status };
  }

  const failed = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", transactionId: input.transactionId },
    include: paymentInclude,
  });
  // The due stays payable (PENDING/OVERDUE) after a failed payment.
  return { paymentStatus: failed.status, dueStatus: failed.due.status };
}

export async function paymentHistory(
  actor: User,
  input: { cursor?: string; limit: number },
): Promise<{ items: PaymentInfo[]; nextCursor: string | null }> {
  const residentId = await actorResidentProfileId(actor);
  const payments = await prisma.payment.findMany({
    where: { residentId },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: paymentInclude,
  });
  const hasMore = payments.length > input.limit;
  const items = (hasMore ? payments.slice(0, input.limit) : payments).map(toPaymentInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

// ---------------------------------------------------------------------------
// Offline payments (cash / cheque / direct transfer)
//
// The resident uploads a receipt; an admin verifies it. Until that decision
// the due stays payable, so nobody marks themselves paid — the receipt is a
// claim, and only an admin turns a claim into a PAID due.
// ---------------------------------------------------------------------------

export async function submitOfflinePayment(
  actor: User,
  input: { dueId: string; receiptUrl: string; note?: string },
): Promise<PaymentInfo> {
  assertCloudinaryUrl(input.receiptUrl);

  const residentProfile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true, flatId: true },
  });
  if (!residentProfile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }

  // Residents pay their own flat's dues only.
  const due = await prisma.maintenanceDue.findFirst({
    where: { id: input.dueId, flatId: residentProfile.flatId },
  });
  if (!due) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Due not found" });
  }
  if (due.status === "PAID") {
    throw new TRPCError({ code: "CONFLICT", message: "This due is already paid" });
  }

  // One claim at a time: a second receipt while the first is undecided would
  // give an admin two things to approve for one due, and approving both would
  // double-pay it.
  const awaiting = await prisma.payment.findFirst({
    where: { dueId: due.id, status: "PENDING_VERIFICATION" },
  });
  if (awaiting) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A receipt for this due is already awaiting verification",
    });
  }

  const payment = await prisma.payment.create({
    data: {
      dueId: due.id,
      residentId: residentProfile.id,
      amount: due.amount,
      method: "OFFLINE",
      status: "PENDING_VERIFICATION",
      receiptUrl: input.receiptUrl,
      note: input.note,
    },
    include: paymentInclude,
  });

  if (actor.societyId) {
    await notifyUsers(await societyAdminUserIds(actor.societyId), {
      type: "PAYMENT_SUBMITTED",
      title: "Receipt awaiting verification",
      body: `${actor.name} submitted a receipt for ${due.month}/${due.year} maintenance`,
      data: { paymentId: payment.id },
    });
  }

  return toPaymentInfo(payment);
}

export interface PendingPaymentInfo extends PaymentInfo {
  residentName: string;
  flatNumber: string;
  towerName: string;
}

/** Admin queue: offline receipts awaiting a decision, oldest first. */
export async function listPendingOfflinePayments(
  actor: User,
  input: { cursor?: string; limit: number },
): Promise<{ items: PendingPaymentInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);

  const payments = await prisma.payment.findMany({
    where: {
      status: "PENDING_VERIFICATION",
      // Scope to this admin's society via the due's flat.
      due: { flat: { tower: { societyId } } },
    },
    // Oldest first: the resident who has been waiting longest is the one whose
    // due is closest to going overdue.
    orderBy: { createdAt: "asc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      due: { include: { flat: { include: { tower: true } } } },
      resident: { include: { user: { select: { name: true } } } },
    },
  });

  const hasMore = payments.length > input.limit;
  const page = hasMore ? payments.slice(0, input.limit) : payments;
  const items: PendingPaymentInfo[] = page.map((p) => ({
    ...toPaymentInfo(p),
    residentName: p.resident.user.name,
    flatNumber: p.due.flat.flatNumber,
    towerName: p.due.flat.tower.name,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Admin decision on an uploaded receipt. Approving marks the due PAID in the
 * same transaction as the payment, so the two can never disagree; rejecting
 * leaves the due payable and lets the resident submit a better receipt.
 */
export async function decideOfflinePayment(
  actor: User,
  input: { paymentId: string; approve: boolean; rejectionReason?: string },
): Promise<PaymentInfo> {
  const societyId = actorSocietyId(actor);

  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      due: { flat: { tower: { societyId } } },
    },
    include: { ...paymentInclude, resident: { select: { userId: true } } },
  });
  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
  }
  if (payment.method !== "OFFLINE") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only offline payments are verified by hand",
    });
  }
  if (payment.status !== "PENDING_VERIFICATION") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This receipt is already ${payment.status}`,
    });
  }

  const decidedAt = new Date();

  const updated = input.approve
    ? await prisma.$transaction(async (tx) => {
        const p = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCESS",
            paidAt: decidedAt,
            verifiedByAdminId: actor.id,
            verifiedAt: decidedAt,
          },
          include: paymentInclude,
        });
        await tx.maintenanceDue.update({
          where: { id: payment.dueId },
          data: { status: "PAID" },
        });
        return p;
      })
    : await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          verifiedByAdminId: actor.id,
          verifiedAt: decidedAt,
          rejectionReason: input.rejectionReason,
        },
        include: paymentInclude,
      });

  const monthLabel = `${updated.due.month}/${updated.due.year}`;
  await notifyUsers([payment.resident.userId], {
    type: input.approve ? "PAYMENT_VERIFIED" : "PAYMENT_REJECTED",
    title: input.approve ? "Payment verified" : "Payment rejected",
    body: input.approve
      ? `Your ${monthLabel} maintenance payment has been verified.`
      : input.rejectionReason
        ? `Your ${monthLabel} receipt was rejected: ${input.rejectionReason}`
        : `Your ${monthLabel} receipt was rejected. Please submit a valid receipt.`,
    data: { paymentId: updated.id, dueId: updated.dueId },
  });

  return toPaymentInfo(updated);
}
