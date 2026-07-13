import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type DueStatus } from "@repo/database";

/**
 * Maintenance dues. Admins generate one due per flat per month; residents
 * see their own flat's dues. PENDING dues past their dueDate are flipped to
 * OVERDUE by the periodic sweep in apps/api.
 */

const dueInclude = {
  flat: { include: { tower: { select: { name: true, societyId: true } } } },
} satisfies Prisma.MaintenanceDueInclude;

type DueRow = Prisma.MaintenanceDueGetPayload<{ include: typeof dueInclude }>;

export interface DueInfo {
  id: string;
  flatId: string;
  flatNumber: string;
  towerName: string;
  month: number;
  year: number;
  amount: number;
  dueDate: string;
  status: DueStatus;
}

export function toDueInfo(due: DueRow): DueInfo {
  return {
    id: due.id,
    flatId: due.flatId,
    flatNumber: due.flat.flatNumber,
    towerName: due.flat.tower.name,
    month: due.month,
    year: due.year,
    amount: Number(due.amount),
    dueDate: due.dueDate.toISOString(),
    status: due.status,
  };
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

/**
 * Creates one due per flat of the admin's society for the given month.
 * Idempotent: flats that already have a due for that month/year are skipped
 * (unique constraint on flatId+month+year).
 */
export async function generateMonthly(
  actor: User,
  input: { month: number; year: number; amount: number; dueDate?: string },
): Promise<{ created: number; skipped: number }> {
  const societyId = actorSocietyId(actor);
  const dueDate = input.dueDate
    ? new Date(input.dueDate)
    : new Date(Date.UTC(input.year, input.month - 1, 10)); // default: 10th of the month

  const flats = await prisma.flat.findMany({
    where: { tower: { societyId } },
    select: { id: true },
  });
  if (flats.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const result = await prisma.maintenanceDue.createMany({
    data: flats.map((flat) => ({
      flatId: flat.id,
      month: input.month,
      year: input.year,
      amount: input.amount,
      dueDate,
    })),
    skipDuplicates: true,
  });

  // TODO(Phase 8): NotificationService — push "maintenance due generated" to
  // each flat's residents here.

  return { created: result.count, skipped: flats.length - result.count };
}

/** Residents list their own flat's dues; admins the whole society's. */
export async function listDues(
  actor: User,
  input: {
    status?: DueStatus;
    month?: number;
    year?: number;
    flatId?: string;
    cursor?: string;
    limit: number;
  },
): Promise<{ items: DueInfo[]; nextCursor: string | null }> {
  let scope: Prisma.MaintenanceDueWhereInput;
  if (actor.role === "RESIDENT") {
    const profile = await prisma.residentProfile.findUnique({
      where: { userId: actor.id },
      select: { flatId: true },
    });
    if (!profile) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Your account has no resident profile",
      });
    }
    scope = { flatId: profile.flatId };
  } else if (actor.role === "ADMIN") {
    scope = {
      flat: { tower: { societyId: actorSocietyId(actor) } },
      ...(input.flatId ? { flatId: input.flatId } : {}),
    };
  } else {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only residents and admins can list dues",
    });
  }

  const dues = await prisma.maintenanceDue.findMany({
    where: {
      ...scope,
      ...(input.status ? { status: input.status } : {}),
      ...(input.month ? { month: input.month } : {}),
      ...(input.year ? { year: input.year } : {}),
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { flatId: "asc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: dueInclude,
  });

  const hasMore = dues.length > input.limit;
  const items = (hasMore ? dues.slice(0, input.limit) : dues).map(toDueInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Flips PENDING dues whose dueDate has passed to OVERDUE. Called by the
 * periodic sweep in apps/api. Returns how many were flipped.
 */
export async function markOverdueDues(): Promise<number> {
  const result = await prisma.maintenanceDue.updateMany({
    where: { status: "PENDING", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
  return result.count;
}
