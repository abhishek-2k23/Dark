import { authService } from "@repo/services";

import { z } from "../../schema";
import { publicProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/account");

// ---------------------------------------------------------------------------
// Inputs / models
// ---------------------------------------------------------------------------

const RequestDeletionInput = z.object({
  email: z.email().describe("Email of the account to delete"),
});

const ConfirmDeletionInput = z.object({
  email: z.email().describe("Email of the account being deleted"),
  code: z.string().min(4).describe("The 6-digit code from the deletion email"),
});

const RequestDeletionResult = z
  .object({
    status: z
      .enum(["OTP_SENT", "DEMO_BLOCKED"])
      .describe(
        "OTP_SENT: a code was emailed (or the account doesn't exist — indistinguishable). " +
          "DEMO_BLOCKED: this is a demo/test account and can never be deleted.",
      ),
    devCode: z
      .string()
      .optional()
      .describe("The OTP itself — present only when OTP_DEV_ECHO=true (dev)"),
  })
  .describe("Outcome of an account-deletion request");

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const accountRouter = router({
  requestDeletion: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("deletion/request"),
        tags: ["Account"],
        summary: "Request account deletion (emails a one-time code)",
        description:
          "Starts the self-serve account-deletion flow. For a real, active account a 6-digit code is " +
          "emailed; confirm it at /v1/account/deletion/confirm. Demo/test accounts return " +
          "`status: DEMO_BLOCKED` and can never be deleted. Unknown or already-deactivated emails also " +
          "return `status: OTP_SENT` (with nothing sent) so the endpoint can't reveal which emails exist. " +
          "`devCode` is present only when OTP_DEV_ECHO=true.",
      },
    })
    .input(RequestDeletionInput)
    .output(RequestDeletionResult)
    .mutation(({ input }) => authService.requestAccountDeletion(input)),

  confirmDeletion: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("deletion/confirm"),
        tags: ["Account"],
        summary: "Confirm account deletion with the emailed code",
        description:
          "Verifies the emailed code and permanently deletes the account: it is deactivated, all personal " +
          "data is scrubbed, and every session is revoked. The freed email/phone can be reused to register " +
          "again. Errors: 401 on an invalid/expired code, 403 for demo/test accounts, 429 after too many " +
          "wrong attempts (request a new code).",
      },
    })
    .input(ConfirmDeletionInput)
    .output(SuccessModel)
    .mutation(async ({ input }) => {
      await authService.confirmAccountDeletion(input);
      return { success: true as const };
    }),
});
