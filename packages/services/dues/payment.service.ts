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
import {
  assertNoPaymentInFlight,
  gatewayEligible,
  resolveTargetForResident,
  revertTarget,
  settleTarget,
  targetFk,
  upiDirectEligible,
  type PaymentTargetKind,
  type PaymentTargetRef,
} from "./payment-target";
import { buildUpiIntent, type UpiIntent } from "./upi";

/**
 * Payments against a due, an amenity booking, or a service bill.
 *
 * Resident money never passes through us. Two live rails:
 *
 *  - UPI_DIRECT — the payer pays the payee's VPA peer-to-peer from their own
 *    UPI app. We never see the money, so the payer's UTR is a claim.
 *  - OFFLINE — cash/cheque/transfer evidenced by an uploaded receipt.
 *
 * The GATEWAY rail (UPI/CARD/NETBANKING) is inert. It was built on Razorpay
 * Route, which was dropped: Razorpay is now used only for a society's own
 * subscription to Portl, where we are the merchant and no split settlement is
 * involved. Nothing sets Society.payoutStatus ACTIVE any more, so
 * gatewayEligible() is false everywhere and paymentOptions never offers it.
 *
 * Both manual rails land in PENDING_VERIFICATION and leave the target payable
 * until a human decides, so nobody marks themselves paid on their own say-so.
 * The one exception is service bills — see `selfAttests`.
 */

const paymentInclude = {
  due: true,
  booking: { include: { amenity: { select: { name: true } } } },
  serviceBill: { include: { serviceProvider: { select: { name: true } } } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface PaymentInfo {
  id: string;
  targetKind: PaymentTargetKind;
  targetId: string;
  targetLabel: string;
  /** Retained for the existing dues screens; null on booking/service payments. */
  dueId: string | null;
  dueMonth: number | null;
  dueYear: number | null;
  bookingId: string | null;
  serviceBillId: string | null;
  amount: number;
  method: PaymentMethod;
  transactionId: string | null;
  upiUtr: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  receiptUrl: string | null;
  note: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

/** Derives the target triple from whichever FK is set (the CHECK guarantees one). */
function targetOf(payment: PaymentRow): {
  kind: PaymentTargetKind;
  id: string;
  label: string;
} {
  if (payment.due) {
    return {
      kind: "DUE",
      id: payment.due.id,
      label: `${payment.due.month}/${payment.due.year} maintenance`,
    };
  }
  if (payment.booking) {
    const date = payment.booking.date.toISOString().slice(0, 10);
    return {
      kind: "BOOKING",
      id: payment.booking.id,
      label: `${payment.booking.amenity.name} ${payment.booking.startTime}–${payment.booking.endTime} on ${date}`,
    };
  }
  if (payment.serviceBill) {
    return {
      kind: "SERVICE_BILL",
      id: payment.serviceBill.id,
      label: payment.serviceBill.periodLabel
        ? `${payment.serviceBill.periodLabel} — ${payment.serviceBill.serviceProvider.name}`
        : payment.serviceBill.serviceProvider.name,
    };
  }
  // Unreachable while the CHECK constraint holds; loud rather than silent if it
  // ever stops holding.
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Payment ${payment.id} has no target`,
  });
}

function toPaymentInfo(payment: PaymentRow): PaymentInfo {
  const target = targetOf(payment);
  return {
    id: payment.id,
    targetKind: target.kind,
    targetId: target.id,
    targetLabel: target.label,
    dueId: payment.dueId,
    dueMonth: payment.due?.month ?? null,
    dueYear: payment.due?.year ?? null,
    bookingId: payment.bookingId,
    serviceBillId: payment.serviceBillId,
    amount: Number(payment.amount),
    method: payment.method,
    transactionId: payment.transactionId,
    upiUtr: payment.upiUtr,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    receiptUrl: payment.receiptUrl,
    note: payment.note,
    rejectionReason: payment.rejectionReason,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

/**
 * Whether a manual-rail payment for this target is trusted on submission.
 *
 * Service bills are: a society admin has no way of knowing whether a resident
 * actually paid their maid, so gating on their approval would be theatre that
 * delays every resident for no added truth. The resident's word stands, and
 * admins get a reversal instead (`reverseServicePayment`).
 *
 * Dues and bookings are not: that money is owed to the society, whose admins
 * *can* check their own bank statement against the claim.
 */
function selfAttests(kind: PaymentTargetKind): boolean {
  return kind === "SERVICE_BILL";
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
    select: { id: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile.id;
}

/** Scopes a payment to a society across all three target shapes. */
function societyScope(societyId: string): Prisma.PaymentWhereInput {
  return {
    OR: [
      { due: { flat: { tower: { societyId } } } },
      { booking: { amenity: { societyId } } },
      { serviceBill: { serviceProvider: { societyId } } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rail availability
// ---------------------------------------------------------------------------

export interface PaymentOptions {
  targetKind: PaymentTargetKind;
  targetId: string;
  amount: number;
  payeeName: string;
  gateway: boolean;
  upiDirect: boolean;
  /** Always true — offline is the floor that works with no payee setup at all. */
  offline: boolean;
}

/**
 * What rails a resident can actually use for this target right now. The client
 * renders exactly these, so a resident is never shown a method that would fail
 * at submission.
 */
export async function paymentOptions(
  actor: User,
  input: PaymentTargetRef,
): Promise<PaymentOptions> {
  const target = await resolveTargetForResident(actor, input);
  return {
    targetKind: target.ref.kind,
    targetId: target.ref.id,
    amount: Number(target.amount),
    payeeName: target.payee.name,
    gateway: gatewayEligible(target.payee),
    upiDirect: upiDirectEligible(target.payee),
    offline: true,
  };
}

// ---------------------------------------------------------------------------
// Gateway rail
// ---------------------------------------------------------------------------

export interface GatewaySession {
  provider: "MOCK" | "RAZORPAY";
  orderId: string;
  /** MOCK only — Razorpay checkout is opened by the client SDK, not a URL. */
  checkoutUrl: string | null;
  /** RAZORPAY only — the publishable key the client SDK needs. */
  keyId: string | null;
  amount: number;
  currency: "INR";
}

export async function initiatePayment(
  actor: User,
  input: PaymentTargetRef & { method: PaymentMethod },
): Promise<{ payment: PaymentInfo; gateway: GatewaySession }> {
  // Neither manual rail has a checkout, so handing one a session would mint
  // meaningless data. They have their own entry points.
  if (input.method === "OFFLINE" || input.method === "UPI_DIRECT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${input.method} payments are submitted with evidence, not through the gateway`,
    });
  }

  const target = await resolveTargetForResident(actor, input);
  if (!gatewayEligible(target.payee)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        target.payee.kind === "SERVICE_PROVIDER"
          ? "Service people are paid directly over UPI or offline, not through the gateway"
          : `${target.payee.name} has not finished payout setup yet — pay by UPI or offline for now`,
    });
  }

  const residentId = await actorResidentProfileId(actor);

  // The in-flight guard and the insert share a transaction, or two concurrent
  // checkouts both pass the check and both create a payment.
  const payment = await prisma.$transaction(async (tx) => {
    await assertNoPaymentInFlight(tx, target.ref);
    return tx.payment.create({
      data: {
        ...targetFk(target.ref),
        residentId,
        amount: target.amount,
        method: input.method,
      },
      include: paymentInclude,
    });
  });

  // The gateway rail is inert by design: Razorpay is now used only for a
  // society's own subscription to Portl, never for resident money. Nothing
  // sets payoutStatus ACTIVE any more, so gatewayEligible() above is false for
  // every society and this path is unreachable in practice. It is kept as MOCK
  // rather than deleted so the state machine (INITIATED -> SUCCESS/FAILED via
  // webhook) stays exercisable, and so re-adding Route later is a small change.
  return {
    payment: toPaymentInfo(payment),
    gateway: {
      provider: "MOCK",
      orderId: `mock_order_${payment.id}`,
      checkoutUrl: `https://mock-gateway.local/checkout/${payment.id}`,
      keyId: null,
      amount: Number(target.amount),
      currency: "INR",
    },
  };
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
}): Promise<{ paymentStatus: PaymentStatus; targetSettled: boolean }> {
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

  // A manual-rail payment has no gateway behind it, so any webhook naming one
  // is either a mistake or forged — it must never be able to self-approve
  // evidence that is waiting on a human.
  if (payment.method === "OFFLINE" || payment.method === "UPI_DIRECT") {
    logger.info("Payment webhook rejected: manual-rail payment", { paymentId: payment.id });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This payment is not settled by the gateway",
    });
  }

  const target = targetOf(payment);
  const ref: PaymentTargetRef = { kind: target.kind, id: target.id };

  // Idempotency: same event replayed after processing is a no-op.
  if (payment.status !== "INITIATED") {
    const matchesProcessed =
      payment.transactionId === input.transactionId &&
      payment.status === (input.event === "payment.success" ? "SUCCESS" : "FAILED");
    if (matchesProcessed) {
      return { paymentStatus: payment.status, targetSettled: payment.status === "SUCCESS" };
    }
    throw new TRPCError({
      code: "CONFLICT",
      message: `Payment is already ${payment.status}`,
    });
  }

  if (input.event === "payment.success") {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCESS", transactionId: input.transactionId, paidAt: new Date() },
      });
      await settleTarget(tx, ref);
    });
    return { paymentStatus: "SUCCESS", targetSettled: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", transactionId: input.transactionId },
    });
    // A due or bill simply stays payable; a booking's hold is released, since
    // holding a slot for a failed payment blocks everyone else.
    if (ref.kind === "BOOKING") await revertTarget(tx, ref);
  });
  return { paymentStatus: "FAILED", targetSettled: false };
}

// ---------------------------------------------------------------------------
// UPI-direct rail
//
// The payer opens their own UPI app against the payee's VPA. We never touch
// the money — the UTR they type back is evidence, at the same trust level as
// an uploaded receipt, so it is verified rather than believed.
// ---------------------------------------------------------------------------

/** Build the deep link / QR payload for paying this target over UPI. */
export async function upiIntent(
  actor: User,
  input: PaymentTargetRef,
): Promise<UpiIntent> {
  const target = await resolveTargetForResident(actor, input);
  if (!upiDirectEligible(target.payee)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${target.payee.name} has not added a UPI ID`,
    });
  }
  return buildUpiIntent({
    vpa: target.payee.upiVpa!,
    payeeName: target.payee.name,
    amount: Number(target.amount),
    note: target.label,
  });
}

export async function submitUpiDirectPayment(
  actor: User,
  input: PaymentTargetRef & { utr: string; note?: string },
): Promise<PaymentInfo> {
  const target = await resolveTargetForResident(actor, input);
  if (!upiDirectEligible(target.payee)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${target.payee.name} has not added a UPI ID`,
    });
  }

  const residentId = await actorResidentProfileId(actor);
  const attested = selfAttests(target.ref.kind);
  const now = new Date();

  const payment = await prisma.$transaction(async (tx) => {
    await assertNoPaymentInFlight(tx, target.ref);
    const created = await tx.payment.create({
      data: {
        ...targetFk(target.ref),
        residentId,
        amount: target.amount,
        method: "UPI_DIRECT",
        upiUtr: input.utr,
        note: input.note,
        status: attested ? "SUCCESS" : "PENDING_VERIFICATION",
        paidAt: attested ? now : null,
      },
      include: paymentInclude,
    });
    if (attested) await settleTarget(tx, target.ref);
    return created;
  });

  if (!attested && actor.societyId) {
    await notifyUsers(await societyAdminUserIds(actor.societyId), {
      type: "PAYMENT_SUBMITTED",
      title: "UPI payment awaiting verification",
      body: `${actor.name} says they paid ${target.label} by UPI (UTR ${input.utr})`,
      data: { paymentId: payment.id },
    });
  }

  return toPaymentInfo(payment);
}

// ---------------------------------------------------------------------------
// Offline rail (cash / cheque / direct transfer)
// ---------------------------------------------------------------------------

export async function submitOfflinePayment(
  actor: User,
  input: PaymentTargetRef & { receiptUrl: string; note?: string },
): Promise<PaymentInfo> {
  assertCloudinaryUrl(input.receiptUrl);

  const target = await resolveTargetForResident(actor, input);
  const residentId = await actorResidentProfileId(actor);
  const attested = selfAttests(target.ref.kind);
  const now = new Date();

  const payment = await prisma.$transaction(async (tx) => {
    await assertNoPaymentInFlight(tx, target.ref);
    const created = await tx.payment.create({
      data: {
        ...targetFk(target.ref),
        residentId,
        amount: target.amount,
        method: "OFFLINE",
        receiptUrl: input.receiptUrl,
        note: input.note,
        status: attested ? "SUCCESS" : "PENDING_VERIFICATION",
        paidAt: attested ? now : null,
      },
      include: paymentInclude,
    });
    if (attested) await settleTarget(tx, target.ref);
    return created;
  });

  if (!attested && actor.societyId) {
    await notifyUsers(await societyAdminUserIds(actor.societyId), {
      type: "PAYMENT_SUBMITTED",
      title: "Receipt awaiting verification",
      body: `${actor.name} submitted a receipt for ${target.label}`,
      data: { paymentId: payment.id },
    });
  }

  return toPaymentInfo(payment);
}

// ---------------------------------------------------------------------------
// Admin verification queue (both manual rails)
// ---------------------------------------------------------------------------

export interface PendingPaymentInfo extends PaymentInfo {
  residentName: string;
  flatNumber: string;
  towerName: string;
}

const pendingInclude = {
  ...paymentInclude,
  resident: {
    include: {
      user: { select: { name: true } },
      flat: { include: { tower: { select: { name: true } } } },
    },
  },
} satisfies Prisma.PaymentInclude;

/** Admin queue: manual-rail evidence awaiting a decision, oldest first. */
export async function listPendingPayments(
  actor: User,
  input: { cursor?: string; limit: number },
): Promise<{ items: PendingPaymentInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);

  const payments = await prisma.payment.findMany({
    where: { status: "PENDING_VERIFICATION", ...societyScope(societyId) },
    // Oldest first: the resident who has been waiting longest is the one whose
    // due is closest to going overdue.
    orderBy: { createdAt: "asc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: pendingInclude,
  });

  const hasMore = payments.length > input.limit;
  const page = hasMore ? payments.slice(0, input.limit) : payments;
  const items: PendingPaymentInfo[] = page.map((p) => ({
    ...toPaymentInfo(p),
    residentName: p.resident.user.name,
    // Taken from the resident's own flat rather than the target, because only
    // one of the three target shapes has a flat behind it.
    flatNumber: p.resident.flat.flatNumber,
    towerName: p.resident.flat.tower.name,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Admin decision on submitted evidence. Approving marks the target settled in
 * the same transaction as the payment, so the two can never disagree;
 * rejecting leaves the target payable and lets the resident submit again.
 */
export async function decideManualPayment(
  actor: User,
  input: { paymentId: string; approve: boolean; rejectionReason?: string },
): Promise<PaymentInfo> {
  const societyId = actorSocietyId(actor);

  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, ...societyScope(societyId) },
    include: { ...paymentInclude, resident: { select: { userId: true } } },
  });
  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
  }
  if (payment.method !== "OFFLINE" && payment.method !== "UPI_DIRECT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only manually-submitted payments are verified by hand",
    });
  }
  if (payment.status !== "PENDING_VERIFICATION") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This payment is already ${payment.status}`,
    });
  }

  const target = targetOf(payment);
  const ref: PaymentTargetRef = { kind: target.kind, id: target.id };
  const decidedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: input.approve
        ? {
            status: "SUCCESS",
            paidAt: decidedAt,
            verifiedByAdminId: actor.id,
            verifiedAt: decidedAt,
          }
        : {
            status: "REJECTED",
            verifiedByAdminId: actor.id,
            verifiedAt: decidedAt,
            rejectionReason: input.rejectionReason,
          },
      include: paymentInclude,
    });
    if (input.approve) {
      await settleTarget(tx, ref);
    } else if (ref.kind === "BOOKING") {
      // Rejecting frees the slot; a due or bill just stays payable.
      await revertTarget(tx, ref);
    }
    return p;
  });

  await notifyUsers([payment.resident.userId], {
    type: input.approve ? "PAYMENT_VERIFIED" : "PAYMENT_REJECTED",
    title: input.approve ? "Payment verified" : "Payment rejected",
    body: input.approve
      ? `Your payment for ${target.label} has been verified.`
      : input.rejectionReason
        ? `Your payment for ${target.label} was rejected: ${input.rejectionReason}`
        : `Your payment for ${target.label} was rejected. Please submit again.`,
    data: { paymentId: updated.id, targetId: target.id, targetKind: target.kind },
  });

  return toPaymentInfo(updated);
}

/**
 * Reverse a self-attested service-bill payment.
 *
 * Service-bill payments are believed on submission (see `selfAttests`), which
 * would leave an incorrect claim permanent with no recourse. This is that
 * recourse: the payment becomes REJECTED, the bill returns to payable, and the
 * resident is told why.
 */
export async function reverseServicePayment(
  actor: User,
  input: { paymentId: string; reason: string },
): Promise<PaymentInfo> {
  const societyId = actorSocietyId(actor);

  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, ...societyScope(societyId) },
    include: { ...paymentInclude, resident: { select: { userId: true } } },
  });
  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
  }
  if (!payment.serviceBillId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only service-bill payments are reversed; others are verified before they settle",
    });
  }
  if (payment.status !== "SUCCESS") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This payment is ${payment.status} and has nothing to reverse`,
    });
  }

  const target = targetOf(payment);
  const ref: PaymentTargetRef = { kind: target.kind, id: target.id };
  const reversedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        paidAt: null,
        verifiedByAdminId: actor.id,
        verifiedAt: reversedAt,
        rejectionReason: input.reason,
      },
      include: paymentInclude,
    });
    await revertTarget(tx, ref);
    return p;
  });

  await notifyUsers([payment.resident.userId], {
    type: "SERVICE_PAYMENT_REVERSED",
    title: "Service payment reversed",
    body: `An admin reversed your payment for ${target.label}: ${input.reason}`,
    data: { paymentId: updated.id, targetId: target.id },
  });

  return toPaymentInfo(updated);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function paymentHistory(
  actor: User,
  input: { cursor?: string; limit: number; targetKind?: PaymentTargetKind },
): Promise<{ items: PaymentInfo[]; nextCursor: string | null }> {
  const residentId = await actorResidentProfileId(actor);

  const kindFilter: Prisma.PaymentWhereInput =
    input.targetKind === "DUE"
      ? { dueId: { not: null } }
      : input.targetKind === "BOOKING"
        ? { bookingId: { not: null } }
        : input.targetKind === "SERVICE_BILL"
          ? { serviceBillId: { not: null } }
          : {};

  const payments = await prisma.payment.findMany({
    where: { residentId, ...kindFilter },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: paymentInclude,
  });
  const hasMore = payments.length > input.limit;
  const items = (hasMore ? payments.slice(0, input.limit) : payments).map(toPaymentInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/** Kept as a named re-export so callers don't reach into payment-target.ts. */
export type { PaymentTargetKind, PaymentTargetRef, DueStatus };
