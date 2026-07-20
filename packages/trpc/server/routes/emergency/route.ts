import { emergencyService } from "@repo/services";

import { z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const emergencyPath = generatePath("v1/emergencies");

/**
 * The panic alarm is the one module with no role gate anywhere: every endpoint
 * is `protectedProcedure`. Raising, resolving, and reading are all open to any
 * member of the society, because an emergency is not an org-chart problem.
 */

const EmergencyTypeEnum = z
  .enum(["MEDICAL", "FIRE", "SECURITY", "OTHER"])
  .describe("What kind of emergency is being reported");

const EmergencyStatusEnum = z
  .enum(["ACTIVE", "RESOLVED"])
  .describe("Whether the alarm is still live or has been stood down");

const EmergencyAlertModel = z
  .object({
    id: z.string().describe("Emergency alert id"),
    type: EmergencyTypeEnum,
    note: z.string().nullable().describe("Free-text detail, if the raiser had time to add any"),
    status: EmergencyStatusEnum,
    raisedBy: z
      .object({
        id: z.string().describe("User id"),
        name: z.string().describe("Full name"),
        phone: z.string().nullable().describe("Phone, so responders can call back"),
      })
      .describe("Who raised the alarm"),
    flatLabel: z
      .string()
      .nullable()
      .describe("Flat the alarm came from, e.g. 'A-101'; null when raised by a guard or admin"),
    resolvedBy: z
      .object({ id: z.string().describe("User id"), name: z.string().describe("Full name") })
      .nullable()
      .describe("Who sounded the all-clear; null while ACTIVE"),
    resolvedAt: z.string().nullable().describe("ISO time the alarm was stood down"),
    createdAt: z.string().describe("ISO time the alarm was raised"),
  })
  .describe("A society-wide emergency alarm");

export const emergencyRouter = router({
  raise: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: emergencyPath("raise"),
        tags: ["Emergency"],
        summary: "Raise a society-wide emergency alarm",
        description:
          "Broadcasts a panic alarm to every active member of the caller's society — residents, " +
          "guards, and admins alike. The caller's flat is stamped on the alert when they have " +
          "one. Repeat calls with the same type within two minutes collapse onto the caller's " +
          "existing live alarm rather than raising a second one, so a double-tap or a repeated " +
          "shake does not alarm the society twice. Errors: 401 if not authenticated, 412 if the " +
          "account is not linked to a society.",
        protect: true,
      },
    })
    .input(
      z.object({
        type: EmergencyTypeEnum,
        note: z
          .string()
          .max(500)
          .describe("Optional detail; usually omitted, since speed is the point")
          .optional(),
      }),
    )
    .output(EmergencyAlertModel)
    .mutation(({ ctx, input }) => emergencyService.raiseEmergency(ctx.user, input)),

  active: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: emergencyPath("active"),
        tags: ["Emergency"],
        summary: "List live alarms in the caller's society",
        description:
          "Every ACTIVE alarm in the caller's society, newest first. Drives the persistent " +
          "banner, so it is unpaginated and capped. Errors: 401 if not authenticated, 412 if " +
          "the account is not linked to a society.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(z.array(EmergencyAlertModel))
    .query(({ ctx }) => emergencyService.listActiveEmergencies(ctx.user)),

  history: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: emergencyPath(""),
        tags: ["Emergency"],
        summary: "Emergency alarm history",
        description:
          "Cursor-paginated alarm history for the caller's society, newest first, optionally " +
          "filtered by status. Errors: 401 if not authenticated, 412 if the account is not " +
          "linked to a society.",
        protect: true,
      },
    })
    .input(
      z.object({
        status: EmergencyStatusEnum.describe("Only alarms with this status").optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
        cursor: z.string().describe("Id of the last alarm from the previous page").optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(EmergencyAlertModel).describe("Alarms on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when this is the last page"),
      }),
    )
    .query(({ ctx, input }) => emergencyService.listEmergencies(ctx.user, input)),

  // Registered after the static /active and /history paths so the REST matcher
  // never swallows them as an {emergencyId}.
  resolve: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: emergencyPath("{emergencyId}/resolve"),
        tags: ["Emergency"],
        summary: "Sound the all-clear on an alarm",
        description:
          "Marks a live alarm resolved and tells the society. Open to any member, not just " +
          "admins: whoever reached the scene is best placed to stand it down. Errors: 401 if " +
          "not authenticated, 404 if the alarm is not in the caller's society, 409 if it was " +
          "already resolved.",
        protect: true,
      },
    })
    .input(z.object({ emergencyId: z.string().describe("Id of the alarm to stand down") }))
    .output(EmergencyAlertModel)
    .mutation(({ ctx, input }) => emergencyService.resolveEmergency(ctx.user, input)),
});
