import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import superjson from "superjson";
import { ZodError } from "zod";
import { hasMinPermission, isAppCheckEnforced } from "@repo/auth";
import { subscriptionService } from "@repo/services";
import type { Role } from "@repo/database";

import { createContext } from "./context";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({
    transformer: superjson,
    /**
     * Adds `data.fieldErrors: { field, message }[]` whenever the error came
     * from Zod input validation, so both tRPC clients and OpenAPI/REST
     * consumers get one consistent validation-error shape
     * (see docs/api-conventions.md).
     */
    errorFormatter({ shape, error }) {
      const fieldErrors =
        error.cause instanceof ZodError
          ? error.cause.issues.map((issue) => ({
              field: issue.path.map(String).join("."),
              message: issue.message,
            }))
          : null;
      // Never expose stack traces to clients (tRPC's default only strips
      // them when NODE_ENV === "production", but this repo uses "prod");
      // 5xx causes are logged server-side instead.
      const { stack: _stack, ...data } = shape.data;
      return {
        ...shape,
        data: { ...data, fieldErrors },
      };
    },
  });

export const router = tRPCContext.router;

/**
 * Procedures reachable by callers that cannot produce a Play Integrity / App
 * Attest verdict, and so are never blocked by `appCheckGuard`.
 *
 * These are exactly the endpoints the Next.js web app calls
 * (`apps/web/lib/api.ts`): a browser has no Play install to attest, and Play
 * requires the account-deletion route to stay reachable from the web. Both are
 * already public, rate-limited and no-enumeration by design, so leaving them
 * open costs nothing that attestation was protecting.
 *
 * Anything added here is a hole in attestation — keep the list short and keep
 * the reason next to the entry.
 */
const APP_CHECK_EXEMPT_PATHS = new Set([
  "account.requestDeletion",
  "account.confirmDeletion",
]);

/**
 * Rejects callers with no valid attestation once `APP_CHECK_ENFORCE=true`.
 *
 * Deliberately silent in monitor mode (the default): it records the verdict on
 * every request so the logs can answer "has attested traffic replaced the old
 * installs yet?" before enforcement is switched on. Flipping the flag first
 * would lock out every user still on a build that predates App Check.
 *
 * `unconfigured` never blocks — a missing FIREBASE_PROJECT_NUMBER is our
 * misconfiguration, not the caller's, and failing every request over it would
 * turn a deploy slip into an outage.
 */
const appCheckGuard = tRPCContext.middleware(({ ctx, path, next }) => {
  const { status, reason } = ctx.appCheck;

  if (status === "invalid") {
    console.warn(`[app-check] invalid token on ${path}: ${reason}`);
  } else if (status === "missing" && isAppCheckEnforced()) {
    console.warn(`[app-check] unattested call to ${path}`);
  }

  if (
    isAppCheckEnforced() &&
    !APP_CHECK_EXEMPT_PATHS.has(path) &&
    (status === "missing" || status === "invalid")
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      // Says what is wrong without naming the header, so the message is no help
      // to someone probing for what to forge.
      message: "This app build can no longer talk to the server. Please update Prangan.",
    });
  }

  return next();
});

export const publicProcedure = tRPCContext.procedure.use(appCheckGuard);

const isAuthed = tRPCContext.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to do this",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = publicProcedure.use(isAuthed);

/** Exact-role check, for endpoints tied to one role's data (e.g. a resident's own flat). */
const hasRole = (role: Role) =>
  tRPCContext.middleware(({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Only ${role} accounts can do this`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

export const residentProcedure = protectedProcedure.use(hasRole("RESIDENT"));
export const guardProcedure = protectedProcedure.use(hasRole("GUARD"));
export const adminProcedure = protectedProcedure.use(hasRole("ADMIN"));

/**
 * Admin mutations that a lapsed subscription blocks.
 *
 * Reads stay open at every status — a society's data is never withheld, and an
 * admin must always be able to see the billing screen that lets them fix this.
 * Only writes pause, and only once GRACE has run out into EXPIRED, so a failed
 * card never locks a paying customer out on the day.
 *
 * Residents and guards are unaffected by subscription state entirely: the
 * society's own bill is not their problem, and stopping a guard logging a
 * visitor because an invoice lapsed would be indefensible.
 *
 * Deliberately NOT applied to the billing routes themselves (that would trap
 * an expired society with no way to pay) or to reads.
 */
export const subscribedAdminProcedure = adminProcedure.use(
  tRPCContext.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be logged in to do this" });
    }
    if (ctx.user.societyId) {
      const writable = await subscriptionService.societyWritable(ctx.user.societyId);
      if (!writable) {
        throw new TRPCError({
          code: "FORBIDDEN",
          // No "renew here" instruction: the mobile app cannot sell a
          // subscription (Google Play Payments policy — see
          // apps/portal/src/app/(admin)/billing.tsx), so pointing at a screen
          // with no purchase button would just be wrong.
          message:
            "Your society's subscription has expired. Contact Prangan support to renew and make changes again. Residents are unaffected and your data is safe.",
        });
      }
    }
    // Re-assert the narrowed user, or the chain loses adminProcedure's
    // non-null narrowing and every downstream handler sees `user | null`.
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/**
 * Minimum-permission-level check using the gapped numeric levels from
 * `@repo/auth` (RESIDENT=100, GUARD=200, ADMIN=300). Use for hierarchical
 * endpoints where a more privileged role may also act.
 */
export const withMinPermission = (minLevel: number) =>
  protectedProcedure.use(
    tRPCContext.middleware(({ ctx, next }) => {
      if (!ctx.user || !hasMinPermission(ctx.user.role, minLevel)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to do this",
        });
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    }),
  );
