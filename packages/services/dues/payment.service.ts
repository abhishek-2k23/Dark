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
