import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";
import { hashPassword } from "@repo/auth";

/**
 * Admin-side staff (guard/admin) account creation. Guards and admins never
 * self-signup — a society admin creates their account with a temporary
 * password, which the staff member should change after first login.
 */

export interface StaffInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "GUARD" | "ADMIN";
}

/**
 * Lists the active guards and admins of the actor's society — used by the admin
 * app to pick a ticket assignee. Society-scoped; role gating (adminProcedure)
 * happens in the router.
 */
export async function listStaff(actor: User): Promise<StaffInfo[]> {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  const staff = await prisma.user.findMany({
    where: {
      societyId: actor.societyId,
      role: { in: ["GUARD", "ADMIN"] },
      isActive: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  return staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: s.role as "GUARD" | "ADMIN",
  }));
}

export async function createStaffAccount(
  actor: User,
  input: {
    name: string;
    email?: string;
    phone?: string;
    temporaryPassword: string;
    role: "GUARD" | "ADMIN";
    // Guard-only fields
    gateAssigned?: string;
    shiftStart?: string;
    shiftEnd?: string;
    // Admin-only field
    designation?: string;
  },
): Promise<StaffInfo> {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  const societyId = actor.societyId;

  if (!input.email && !input.phone) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email or a phone number for the staff account",
    });
  }

  const identifierOr: Array<{ email: string } | { phone: string }> = [];
  if (input.email) identifierOr.push({ email: input.email });
  if (input.phone) identifierOr.push({ phone: input.phone });
  const existing = await prisma.user.findFirst({ where: { OR: identifierOr } });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists with this email or phone",
    });
  }

  const passwordHash = await hashPassword(input.temporaryPassword);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      societyId,
      ...(input.role === "GUARD"
        ? {
            guardProfile: {
              create: {
                societyId,
                gateAssigned: input.gateAssigned,
                shiftStart: input.shiftStart,
                shiftEnd: input.shiftEnd,
              },
            },
          }
        : {
            adminProfile: {
              create: { societyId, designation: input.designation },
            },
          }),
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: input.role,
  };
}
