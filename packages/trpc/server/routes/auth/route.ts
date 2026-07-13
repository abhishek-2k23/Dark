import { authService } from "@repo/services";

import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/auth");

// ---------------------------------------------------------------------------
// Shared models
// ---------------------------------------------------------------------------

const RoleEnum = z
  .enum(["RESIDENT", "GUARD", "ADMIN"])
  .describe("Role of the account");

const AuthUserModel = z
  .object({
    id: z.string().describe("User id"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email address, if set"),
    phone: z.string().nullable().describe("Phone number, if set"),
    role: RoleEnum,
    avatarUrl: z.string().nullable().describe("Profile photo URL, if set"),
  })
  .describe("Public shape of the authenticated user");

const AuthSessionModel = z
  .object({
    accessToken: z
      .string()
      .describe("Short-lived JWT (~15 min); send as 'Authorization: Bearer <token>'"),
    refreshToken: z
      .string()
      .describe("Long-lived opaque token (~30 days); exchange at /v1/auth/refresh"),
    user: AuthUserModel,
  })
  .describe("Token pair plus the logged-in user");

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const SignupInput = z.object({
  name: z.string().min(1).describe("Full name of the new resident"),
  email: z.email().optional().describe("Email address (this or phone required)"),
  phone: z
    .string()
    .min(8)
    .optional()
    .describe("Phone number with country code (this or email required)"),
  password: z.string().min(8).describe("Password, minimum 8 characters"),
});

const LoginInput = z.object({
  identifier: z.string().min(1).describe("Email address or phone number"),
  password: z.string().min(1).describe("Account password"),
});

const GoogleLoginInput = z.object({
  idToken: z
    .string()
    .min(1)
    .describe("Google ID token obtained on-device via the Google sign-in SDK"),
});

const RefreshInput = z.object({
  refreshToken: z.string().min(1).describe("Refresh token from a previous login/refresh"),
});

const PasswordResetRequestInput = z.object({
  email: z.email().describe("Email of the account to reset"),
});

const PasswordResetConfirmInput = z.object({
  token: z.string().min(1).describe("Reset token from the password reset email"),
  newPassword: z.string().min(8).describe("New password, minimum 8 characters"),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRouter = router({
  signup: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("signup"),
        tags: ["Auth"],
        summary: "Sign up with email/phone and password",
        description:
          "Creates a resident account. Requires a PendingResidentInvite matching the email or phone " +
          "(created by a society admin); the account is auto-linked to the invited flat and the invite " +
          "is marked CLAIMED. Errors: 400 if neither email nor phone is given, 403 if no invite is found, " +
          "409 if an account already exists with the email/phone.",
      },
    })
    .input(SignupInput)
    .output(AuthSessionModel)
    .mutation(({ input }) => authService.signup(input)),

  login: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("login"),
        tags: ["Auth"],
        summary: "Log in with email/phone and password",
        description:
          "Resolves the identifier as an email first, then as a phone number. " +
          "Errors: 401 on unknown identifier, wrong password, or a Google-only account; " +
          "403 if the account is deactivated.",
      },
    })
    .input(LoginInput)
    .output(AuthSessionModel)
    .mutation(({ input }) => authService.login(input)),

  googleLogin: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("google"),
        tags: ["Auth"],
        summary: "Log in with a Google ID token",
        description:
          "Verifies the Google ID token server-side. Logs in an existing Google-linked account, or " +
          "creates one when a PendingResidentInvite matches the Google email. Errors: 401 on an invalid " +
          "token, 403 if no invite matches, 409 if a password account already uses the email, " +
          "412 if Google login is not configured on the server.",
      },
    })
    .input(GoogleLoginInput)
    .output(AuthSessionModel)
    .mutation(({ input }) => authService.googleLogin(input)),

  refresh: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("refresh"),
        tags: ["Auth"],
        summary: "Rotate a refresh token for a new token pair",
        description:
          "Exchanges a valid refresh token for a new access + refresh pair; the old refresh token is " +
          "revoked (rotation). Reusing an already-rotated token is treated as a compromise signal and " +
          "revokes every session for that user. Errors: 401 on invalid/expired/reused tokens.",
      },
    })
    .input(RefreshInput)
    .output(AuthSessionModel)
    .mutation(({ input }) => authService.refreshSession(input)),

  logout: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("logout"),
        tags: ["Auth"],
        summary: "Log out (revoke one refresh token)",
        description:
          "Revokes the given refresh token. Succeeds even if the token is unknown or already revoked.",
      },
    })
    .input(RefreshInput)
    .output(SuccessModel)
    .mutation(async ({ input }) => {
      await authService.logout(input);
      return { success: true as const };
    }),

  logoutAll: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("logout-all"),
        tags: ["Auth"],
        summary: "Log out everywhere (revoke all refresh tokens)",
        description:
          "Revokes every active refresh token of the calling user. Requires bearer auth. " +
          "Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(
      SuccessModel.extend({
        revokedSessions: z.number().describe("How many active sessions were revoked"),
      }),
    )
    .mutation(async ({ ctx }) => {
      const revokedSessions = await authService.logoutAll(ctx.user.id);
      return { success: true as const, revokedSessions };
    }),

  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("me"),
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        description: "Returns the caller's user record. Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(AuthUserModel)
    .query(({ ctx }) => ({
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
      avatarUrl: ctx.user.avatarUrl,
    })),

  requestPasswordReset: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("password-reset/request"),
        tags: ["Auth"],
        summary: "Request a password reset email",
        description:
          "Issues a short-lived (30 min) reset token for the account. Always returns success so callers " +
          "cannot probe which emails have accounts. Email delivery is stubbed in development: the token " +
          "is written to the server log.",
      },
    })
    .input(PasswordResetRequestInput)
    .output(SuccessModel)
    .mutation(async ({ input }) => {
      await authService.requestPasswordReset(input);
      return { success: true as const };
    }),

  resetPassword: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("password-reset/confirm"),
        tags: ["Auth"],
        summary: "Set a new password using a reset token",
        description:
          "Verifies the reset token, updates the password, and revokes every existing session. " +
          "Tokens stop working once used (they are bound to the old password) or after 30 minutes. " +
          "Errors: 401 on an invalid, expired, or already-used token.",
      },
    })
    .input(PasswordResetConfirmInput)
    .output(SuccessModel)
    .mutation(async ({ input }) => {
      await authService.resetPassword(input);
      return { success: true as const };
    }),
});
