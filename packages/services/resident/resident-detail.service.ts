import { TRPCError } from "@trpc/server";
import {
  prisma,
  type BookingStatus,
  type DueStatus,
  type FlatType,
  type PaymentMethod,
  type PaymentStatus,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type User,
  type VehicleType,
  type VisitorPurpose,
  type VisitorStatus,
} from "@repo/database";

/**
 * Everything an admin can see about one resident, in a single call.
 *
 * The per-domain services are all scoped the wrong way for this screen —
 * `listTickets` is society-wide, `myBookings` and `paymentHistory` answer for
 * the *calling* user, `listDues` filters by flat. None of them let an admin ask
 * "show me this one person". Rather than bend six services, this assembles the
 * read-only view the resident detail screen and its report need.
 *
 * Two things are flat-scoped rather than person-scoped, because that is how the
 * schema models them, and the UI says so explicitly:
 *   - **visitors** belong to a `Flat`, not a resident
 *   - **maintenance dues** are billed to a `Flat`
 * A flat with three residents therefore shows the same visitors and dues on
 * each of their screens. That is the truth of the data, not a bug.
 */

/** Rows returned per section. Enough for a report; not enough to melt a phone. */
export const SECTION_LIMIT = 100;

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface ResidentDetailProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  /** Set while a bulk-imported resident has not claimed their account yet. */
  importedAt: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  joinedAt: string;
  flatId: string;
  flatNumber: string;
  towerName: string;
  floor: number;
  flatType: FlatType;
  isPrimaryResident: boolean;
  moveInDate: string | null;
}

export interface ResidentFamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number | null;
  photoUrl: string | null;
}

export interface ResidentVehicle {
  id: string;
  number: string;
  type: VehicleType;
}

export interface ResidentVisitorEntry {
  id: string;
  name: string;
  phone: string;
  purpose: VisitorPurpose;
  status: VisitorStatus;
  vehicleNumber: string | null;
  entryTime: string | null;
  exitTime: string | null;
  createdAt: string;
}

export interface ResidentTicketEntry {
  id: string;
  referenceCode: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedToName: string | null;
  createdAt: string;
}

export interface ResidentBookingEntry {
  id: string;
  amenityName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  amountDue: number | null;
  createdAt: string;
}

export interface ResidentDueEntry {
  id: string;
  month: number;
  year: number;
  amount: number;
  dueDate: string;
  status: DueStatus;
}

export interface ResidentPaymentEntry {
  id: string;
  /** What was paid for, already resolved to a human label. */
  target: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId: string | null;
  upiUtr: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ResidentDetail {
  profile: ResidentDetailProfile;
  familyMembers: ResidentFamilyMember[];
  vehicles: ResidentVehicle[];
  /** Visitors to the resident's flat, newest first. */
  visitors: ResidentVisitorEntry[];
  tickets: ResidentTicketEntry[];
  bookings: ResidentBookingEntry[];
  /** Dues billed to the resident's flat, newest first. */
  dues: ResidentDueEntry[];
  payments: ResidentPaymentEntry[];
  summary: {
    familyCount: number;
    vehicleCount: number;
    visitorCount: number;
    openTicketCount: number;
    ticketCount: number;
    bookingCount: number;
    outstandingDue: number;
    totalPaid: number;
  };
}

// ---------------------------------------------------------------------------

export async function getResidentDetail(
  actor: User,
  input: { userId: string },
): Promise<ResidentDetail> {
  const societyId = actorSocietyId(actor);

  const user = await prisma.user.findFirst({
    where: { id: input.userId, role: "RESIDENT", societyId },
    include: {
      residentProfile: {
        include: {
          flat: { include: { tower: { select: { name: true } } } },
          familyMembers: true,
          vehicles: true,
        },
      },
    },
  });

  if (!user || !user.residentProfile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resident not found" });
  }

  const profile = user.residentProfile;
  const recent = { orderBy: { createdAt: "desc" }, take: SECTION_LIMIT } as const;

  const [visitors, tickets, bookings, dues, payments, visitorCount, ticketCount, openTicketCount, bookingCount] =
    await Promise.all([
      prisma.visitor.findMany({ where: { flatId: profile.flatId }, ...recent }),
      prisma.helpdeskTicket.findMany({
        where: { residentId: profile.id },
        include: { assignedTo: { select: { name: true } } },
        ...recent,
      }),
      prisma.amenityBooking.findMany({
        where: { residentId: profile.id },
        include: { amenity: { select: { name: true } } },
        ...recent,
      }),
      prisma.maintenanceDue.findMany({
        where: { flatId: profile.flatId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: SECTION_LIMIT,
      }),
      prisma.payment.findMany({
        where: { residentId: profile.id },
        include: {
          due: { select: { month: true, year: true } },
          booking: { include: { amenity: { select: { name: true } } } },
          serviceBill: {
            select: { periodLabel: true, serviceProvider: { select: { name: true } } },
          },
        },
        ...recent,
      }),
      prisma.visitor.count({ where: { flatId: profile.flatId } }),
      prisma.helpdeskTicket.count({ where: { residentId: profile.id } }),
      prisma.helpdeskTicket.count({
        where: { residentId: profile.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.amenityBooking.count({ where: { residentId: profile.id } }),
    ]);

  // Outstanding is flat-level (dues are billed to the flat); total paid is this
  // resident's own settled payments.
  const outstandingDue = dues
    .filter((due) => due.status !== "PAID")
    .reduce((sum, due) => sum + Number(due.amount), 0);
  const totalPaid = payments
    .filter((payment) => payment.status === "SUCCESS")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      importedAt: user.importedAt?.toISOString() ?? null,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      joinedAt: user.createdAt.toISOString(),
      flatId: profile.flatId,
      flatNumber: profile.flat.flatNumber,
      towerName: profile.flat.tower.name,
      floor: profile.flat.floor,
      flatType: profile.flat.type,
      isPrimaryResident: profile.isPrimaryResident,
      moveInDate: profile.moveInDate?.toISOString() ?? null,
    },
    familyMembers: profile.familyMembers.map((member) => ({
      id: member.id,
      name: member.name,
      relation: member.relation,
      age: member.age,
      photoUrl: member.photoUrl,
    })),
    vehicles: profile.vehicles.map((vehicle) => ({
      id: vehicle.id,
      number: vehicle.number,
      type: vehicle.type,
    })),
    visitors: visitors.map((visitor) => ({
      id: visitor.id,
      name: visitor.name,
      phone: visitor.phone,
      purpose: visitor.purpose,
      status: visitor.status,
      vehicleNumber: visitor.vehicleNumber,
      entryTime: visitor.entryTime?.toISOString() ?? null,
      exitTime: visitor.exitTime?.toISOString() ?? null,
      createdAt: visitor.createdAt.toISOString(),
    })),
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      referenceCode: ticket.referenceCode,
      title: ticket.title,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedToName: ticket.assignedTo?.name ?? null,
      createdAt: ticket.createdAt.toISOString(),
    })),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      amenityName: booking.amenity.name,
      date: booking.date.toISOString(),
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      amountDue: booking.amountDue === null ? null : Number(booking.amountDue),
      createdAt: booking.createdAt.toISOString(),
    })),
    dues: dues.map((due) => ({
      id: due.id,
      month: due.month,
      year: due.year,
      amount: Number(due.amount),
      dueDate: due.dueDate.toISOString(),
      status: due.status,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      target: payment.due
        ? `Maintenance ${payment.due.month}/${payment.due.year}`
        : payment.booking
          ? payment.booking.amenity.name
          : payment.serviceBill
            ? [payment.serviceBill.serviceProvider.name, payment.serviceBill.periodLabel]
                .filter(Boolean)
                .join(" · ")
            : "Payment",
      amount: Number(payment.amount),
      method: payment.method,
      status: payment.status,
      transactionId: payment.transactionId,
      upiUtr: payment.upiUtr,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    summary: {
      familyCount: profile.familyMembers.length,
      vehicleCount: profile.vehicles.length,
      visitorCount,
      openTicketCount,
      ticketCount,
      bookingCount,
      outstandingDue,
      totalPaid,
    },
  };
}
