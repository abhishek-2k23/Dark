import { staffService } from "@repo/services";

import { phoneSchema, z, zodUndefinedModel } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/staff");

const StaffRoleEnum = z.enum(["GUARD", "ADMIN"]).describe("Staff role for the new account");

const StaffListItemModel = z
  .object({
    id: z.string().describe("User id"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email, if set"),
    phone: z.string().nullable().describe("Phone, if set"),
    role: StaffRoleEnum,
  })
  .describe("An active guard or admin of the society");

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
  email: z.email().describe("Email (this or phone required)").optional(),
  phone: phoneSchema.describe("10-digit phone (this or email required)").optional(),
  temporaryPassword: z
    .string()
    .min(8)
    .describe("Temporary password (min 8 chars); the staff member should change it after first login"),
  role: StaffRoleEnum,
  gateAssigned: z.string().describe("Assigned gate (GUARD role only)").optional(),
  shiftStart: z.string().describe("Shift start 'HH:mm' 24h (GUARD role only)").optional(),
  shiftEnd: z.string().describe("Shift end 'HH:mm' 24h (GUARD role only)").optional(),
  designation: z.string().describe("Designation, e.g. 'Secretary' (ADMIN role only)").optional(),
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

  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Society"],
        summary: "List the society's staff",
        description:
          "Lists active guards and admins of the calling admin's society — used to pick a " +
          "ticket assignee. Errors: 403 if not an admin, 412 if the account is not linked to " +
          "a society.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(z.array(StaffListItemModel))
    .query(({ ctx }) => staffService.listStaff(ctx.user)),
});
