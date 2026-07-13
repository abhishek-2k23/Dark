import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { hasMinPermission } from "@repo/auth";
import type { Role } from "@repo/database";

import { createContext } from "./context";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

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
