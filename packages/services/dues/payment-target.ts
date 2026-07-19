import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type PayoutOnboardingStatus,
} from "@repo/database";

/**
 * A payment settles exactly one thing. This module is the only place that
 * knows what the three things are, so the payment pipeline itself (initiate,
 * offline receipt, UPI-direct claim, webhook, admin decision) stays target-
 * agnostic — it asks for a target, gets back an amount, a payee, and the
 * functions to mark that target settled or payable again.
 *
 * The database backs this up with a CHECK constraint that exactly one of
 * Payment's three FKs is set (see the 20260719120000 migration). The service
 * layer is not the only writer, so the invariant lives in both places.
 */

export type PaymentTargetKind = "DUE" | "BOOKING" | "SERVICE_BILL";

export interface PaymentTargetRef {
  kind: PaymentTargetKind;
  id: string;
}

/**
 * Who receives the money. Societies can be paid on any rail; service people
 * can only ever be paid peer-to-peer, because `ServiceProvider` has no `User`
 * behind it and therefore nobody who can complete Razorpay's KYC.
 */
export interface Payee {
  kind: "SOCIETY" | "SERVICE_PROVIDER";
  name: string;
  upiVpa: string | null;
  razorpayAccountId: string | null;
  payoutStatus: PayoutOnboardingStatus | null;
}

export interface ResolvedTarget {
  ref: PaymentTargetRef;
  /** Amount owed, in rupees. */
  amount: Prisma.Decimal;
  /** Human label used in notifications and UPI transaction notes. */
  label: string;
  payee: Payee;
}

/** The `Payment` FK column for a target — the one field the CHECK lets us set. */
export function targetFk(ref: PaymentTargetRef): {
  dueId?: string;
  bookingId?: string;
  serviceBillId?: string;
} {
  switch (ref.kind) {
    case "DUE":
      return { dueId: ref.id };
    case "BOOKING":
      return { bookingId: ref.id };
    case "SERVICE_BILL":
      return { serviceBillId: ref.id };
  }
}

/**
 * Whether the gateway rail is open for this payee.
 *
 * Service people are never eligible — see Payee. A society is eligible only
 * once Razorpay has activated its linked account, which happens after the
 * account holder completes their own KYC form and the penny-test passes. Money
 * sent to a non-ACTIVE account would strand in the platform balance, which is
 * exactly the custody this design exists to avoid.
 */
export function gatewayEligible(payee: Payee): boolean {
  return (
    payee.kind === "SOCIETY" &&
    payee.payoutStatus === "ACTIVE" &&
    payee.razorpayAccountId !== null
  );
}

/** Whether the UPI-direct rail is open — purely a question of having a VPA. */
export function upiDirectEligible(payee: Payee): boolean {
  return payee.upiVpa !== null && payee.upiVpa.length > 0;
}

async function residentProfileId(actor: User): Promise<string> {
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

function societyPayee(society: {
  name: string;
  upiVpa: string | null;
  razorpayAccountId: string | null;
  payoutStatus: PayoutOnboardingStatus;
}): Payee {
  return {
    kind: "SOCIETY",
    name: society.name,
    upiVpa: society.upiVpa,
    razorpayAccountId: society.razorpayAccountId,
    payoutStatus: society.payoutStatus,
  };
}

/**
 * Load a target the calling resident is allowed to pay, or throw.
 *
 * 404 rather than 403 when the target belongs to someone else: whether a given
 * due id exists is not something one resident should be able to probe for
 * another flat.
 */
export async function resolveTargetForResident(
  actor: User,
  ref: PaymentTargetRef,
): Promise<ResolvedTarget> {
  const residentId = await residentProfileId(actor);

  switch (ref.kind) {
    case "DUE": {
      const due = await prisma.maintenanceDue.findFirst({
        where: { id: ref.id, flat: { residents: { some: { id: residentId } } } },
        include: { flat: { include: { tower: { include: { society: true } } } } },
      });
      if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Due not found" });
      if (due.status === "PAID") {
        throw new TRPCError({ code: "CONFLICT", message: "This due is already paid" });
      }
      return {
        ref,
        amount: due.amount,
        label: `${due.month}/${due.year} maintenance`,
        payee: societyPayee(due.flat.tower.society),
      };
    }

    case "BOOKING": {
      const booking = await prisma.amenityBooking.findFirst({
        where: { id: ref.id, residentId },
        include: { amenity: { include: { society: true } } },
      });
      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }
      // Only a live hold is payable. A BOOKED one is already paid for; an
      // EXPIRED or CANCELLED one no longer owns the slot, so taking money for
      // it would sell something the resident cannot have.
      if (booking.status !== "PENDING_PAYMENT") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            booking.status === "BOOKED"
              ? "This booking is already paid for"
              : `This booking is ${booking.status.toLowerCase()} and cannot be paid for`,
        });
      }
      if (!booking.amountDue) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This booking is free and needs no payment",
        });
      }
      const date = booking.date.toISOString().slice(0, 10);
      return {
        ref,
        amount: booking.amountDue,
        label: `${booking.amenity.name} ${booking.startTime}–${booking.endTime} on ${date}`,
        payee: societyPayee(booking.amenity.society),
      };
    }

    case "SERVICE_BILL": {
      const bill = await prisma.serviceBill.findFirst({
        where: { id: ref.id, residentId },
        include: { serviceProvider: true },
      });
      if (!bill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Service bill not found" });
      }
      if (bill.status === "PAID") {
        throw new TRPCError({ code: "CONFLICT", message: "This bill is already paid" });
      }
      return {
        ref,
        amount: bill.amount,
        label: bill.periodLabel
          ? `${bill.periodLabel} — ${bill.serviceProvider.name}`
          : `${bill.serviceProvider.name} (${bill.serviceProvider.category.toLowerCase()})`,
        payee: {
          kind: "SERVICE_PROVIDER",
          name: bill.serviceProvider.name,
          upiVpa: bill.serviceProvider.upiVpa,
          razorpayAccountId: null,
          payoutStatus: null,
        },
      };
    }
  }
}

/**
 * At most one payment may be in flight against a target at a time.
 *
 * Without this, a resident could open a gateway checkout and upload an offline
 * receipt for the same due, and an admin approving the receipt while the
 * gateway also succeeded would settle it twice. Callers must run this inside
 * the same transaction as the payment insert, or the check races itself.
 */
export async function assertNoPaymentInFlight(
  tx: Prisma.TransactionClient,
  ref: PaymentTargetRef,
): Promise<void> {
  const inFlight = await tx.payment.findFirst({
    where: {
      ...targetFk(ref),
      status: { in: ["INITIATED", "PENDING_VERIFICATION"] },
    },
    select: { id: true, status: true },
  });
  if (inFlight) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        inFlight.status === "PENDING_VERIFICATION"
          ? "A payment for this is already awaiting verification"
          : "A payment for this is already in progress",
    });
  }
}

/**
 * Mark a target settled. Always called in the same transaction as flipping the
 * payment to SUCCESS, so the two can never disagree.
 */
export async function settleTarget(
  tx: Prisma.TransactionClient,
  ref: PaymentTargetRef,
): Promise<void> {
  switch (ref.kind) {
    case "DUE":
      await tx.maintenanceDue.update({ where: { id: ref.id }, data: { status: "PAID" } });
      return;
    case "BOOKING":
      // The hold becomes a real booking and stops being sweepable.
      await tx.amenityBooking.update({
        where: { id: ref.id },
        data: { status: "BOOKED", holdExpiresAt: null },
      });
      return;
    case "SERVICE_BILL":
      await tx.serviceBill.update({ where: { id: ref.id }, data: { status: "PAID" } });
      return;
  }
}

/**
 * Return a target to payable after a payment failed, was rejected, or was
 * reversed.
 *
 * Dues and bills simply go back to PENDING. A booking cannot: its hold has
 * already been consumed by the failed attempt, and silently keeping the slot
 * reserved for someone who did not pay would block everyone else. It is
 * released as EXPIRED and the resident books again.
 */
export async function revertTarget(
  tx: Prisma.TransactionClient,
  ref: PaymentTargetRef,
): Promise<void> {
  switch (ref.kind) {
    case "DUE":
      await tx.maintenanceDue.update({ where: { id: ref.id }, data: { status: "PENDING" } });
      return;
    case "BOOKING":
      await tx.amenityBooking.update({
        where: { id: ref.id },
        data: { status: "EXPIRED", holdExpiresAt: null },
      });
      return;
    case "SERVICE_BILL":
      await tx.serviceBill.update({ where: { id: ref.id }, data: { status: "PENDING" } });
      return;
  }
}
