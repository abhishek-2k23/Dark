import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type DueStatus } from "@repo/database";

/**
 * Bills a resident owes an individual service person.
 *
 * Raised by the resident, not the service person. `ServiceProvider` is a
 * directory row an admin created — there is no `User` behind it, so a service
 * person cannot log in to raise a bill, confirm a payment, or complete
 * Razorpay KYC. That single fact shapes the whole feature: bills are
 * self-reported, payable only on the peer-to-peer rails, and settled on the
 * resident's own word (with an admin reversal as the recourse — see
 * `reverseServicePayment` in payment.service.ts).
 */

const billInclude = {
  serviceProvider: {
    select: { id: true, name: true, category: true, phone: true, photoUrl: true, upiVpa: true },
  },
} satisfies Prisma.ServiceBillInclude;

type BillRow = Prisma.ServiceBillGetPayload<{ include: typeof billInclude }>;

export interface ServiceBillInfo {
  id: string;
  serviceProviderId: string;
  serviceProviderName: string;
  serviceProviderCategory: string;
  serviceProviderPhone: string;
  serviceProviderPhotoUrl: string | null;
  /** Whether this person can be paid over UPI at all, or only offline. */
  serviceProviderHasUpi: boolean;
  amount: number;
  description: string | null;
  periodLabel: string | null;
  status: DueStatus;
  createdAt: string;
}

function toBillInfo(bill: BillRow): ServiceBillInfo {
  return {
    id: bill.id,
    serviceProviderId: bill.serviceProvider.id,
    serviceProviderName: bill.serviceProvider.name,
    serviceProviderCategory: bill.serviceProvider.category,
    serviceProviderPhone: bill.serviceProvider.phone,
    serviceProviderPhotoUrl: bill.serviceProvider.photoUrl,
    serviceProviderHasUpi: Boolean(bill.serviceProvider.upiVpa),
    amount: Number(bill.amount),
    description: bill.description,
    periodLabel: bill.periodLabel,
    status: bill.status,
    createdAt: bill.createdAt.toISOString(),
  };
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

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

export async function createBill(
  actor: User,
  input: {
    serviceProviderId: string;
    amount: number;
    description?: string;
    periodLabel?: string;
  },
): Promise<ServiceBillInfo> {
  const societyId = actorSocietyId(actor);
  const residentId = await residentProfileId(actor);

  // The service person must be in the caller's own society directory —
  // otherwise a resident could bill themselves against any provider id and
  // pull a stranger's VPA out of the payment options response.
  const provider = await prisma.serviceProvider.findFirst({
    where: { id: input.serviceProviderId, societyId },
    select: { id: true },
  });
  if (!provider) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Service provider not found" });
  }

  const bill = await prisma.serviceBill.create({
    data: {
      serviceProviderId: provider.id,
      residentId,
      amount: input.amount,
      description: input.description,
      periodLabel: input.periodLabel,
    },
    include: billInclude,
  });

  return toBillInfo(bill);
}

export async function listBills(
  actor: User,
  input: {
    status?: DueStatus;
    serviceProviderId?: string;
    limit: number;
    cursor?: string;
  },
): Promise<{ items: ServiceBillInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);

  // Residents see only their own bills. Admins see the society's, because the
  // reversal power is theirs and they need to find the payment behind a
  // disputed bill.
  const scope: Prisma.ServiceBillWhereInput =
    actor.role === "ADMIN"
      ? { serviceProvider: { societyId } }
      : { residentId: await residentProfileId(actor) };

  const bills = await prisma.serviceBill.findMany({
    where: {
      ...scope,
      ...(input.status ? { status: input.status } : {}),
      ...(input.serviceProviderId ? { serviceProviderId: input.serviceProviderId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: billInclude,
  });

  const hasMore = bills.length > input.limit;
  const items = (hasMore ? bills.slice(0, input.limit) : bills).map(toBillInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Delete a bill raised in error.
 *
 * Only while it is unpaid and has no payment history: a bill that has ever
 * been paid is part of the money trail, and deleting it would orphan the
 * payment row (the FK is Restrict, so the database would refuse anyway — this
 * turns that into a clear message instead of a constraint error).
 */
export async function deleteBill(actor: User, input: { billId: string }): Promise<{ id: string }> {
  const residentId = await residentProfileId(actor);

  const bill = await prisma.serviceBill.findFirst({
    where: { id: input.billId, residentId },
    include: { _count: { select: { payments: true } } },
  });
  if (!bill) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Service bill not found" });
  }
  if (bill.status === "PAID") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A paid bill cannot be deleted — it is part of the payment record",
    });
  }
  if (bill._count.payments > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This bill has payment attempts against it and cannot be deleted",
    });
  }

  await prisma.serviceBill.delete({ where: { id: bill.id } });
  return { id: bill.id };
}
