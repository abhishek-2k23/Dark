import { staffService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/staff");

const StaffRoleEnum = z.enum(["GUARD", "ADMIN"]).describe("Staff role for the new account");

const StaffModel = z
  .object({
    id: z.string().describe("User id of the new staff account"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email, if set"),
    phone: z.string().nullable().describe("Phone, if set"),
    role: StaffRoleEnum,
  })
  .describe("A newly created staff account");

const CreateStaffInput = z.object({
  name: z.string().min(1).describe("Full name of the staff member"),
  email: z.email().optional().describe("Email (this or phone required)"),
  phone: z.string().min(8).optional().describe("Phone with country code (this or email required)"),
  temporaryPassword: z
    .string()
    .min(8)
    .describe("Temporary password (min 8 chars); the staff member should change it after first login"),
  role: StaffRoleEnum,
  gateAssigned: z.string().optional().describe("Assigned gate (GUARD role only)"),
  shiftStart: z.string().optional().describe("Shift start 'HH:mm' 24h (GUARD role only)"),
  shiftEnd: z.string().optional().describe("Shift end 'HH:mm' 24h (GUARD role only)"),
  designation: z.string().optional().describe("Designation, e.g. 'Secretary' (ADMIN role only)"),
});

export const staffRouter = router({
  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Society"],
        summary: "Create a guard or admin account",
        description:
          "Creates a staff account (GUARD or ADMIN) in the calling admin's society with a " +
          "temporary password — staff never self-signup. Errors: 400 if neither email nor phone " +
          "is given, 403 if not an admin, 409 if an account already exists with the email/phone.",
        protect: true,
      },
    })
    .input(CreateStaffInput)
    .output(StaffModel)
    .mutation(({ ctx, input }) => staffService.createStaffAccount(ctx.user, input)),
});
