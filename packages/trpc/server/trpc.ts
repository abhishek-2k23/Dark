import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import superjson from "superjson";
import { ZodError } from "zod";
import { hasMinPermission } from "@repo/auth";
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

export const publicProcedure = tRPCContext.procedure;

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
