import { prisma, type User } from "@repo/database";
import { verifyAccessToken, verifyAppCheckToken, type AppCheckResult } from "@repo/auth";

interface ContextRequest {
  headers: {
    authorization?: string | undefined;
    "x-firebase-appcheck"?: string | string[] | undefined;
  };
}

/**
 * Shared context for both the tRPC adapter and the trpc-to-openapi REST
 * middleware. Parses the `Authorization: Bearer <accessToken>` header and
 * attaches the active user (or null for anonymous callers), plus the result of
 * verifying the caller's App Check / Play Integrity token. Whether an unattested
 * caller is turned away is `appCheckGuard`'s decision — see `trpc.ts`.
 */
export async function createContext({ req }: { req: ContextRequest }) {
  let user: User | null = null;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    if (payload) {
      const found = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (found?.isActive) user = found;
    }
  }

  // A repeated header arrives as an array — no single token to trust.
  const raw = req.headers["x-firebase-appcheck"];
  const appCheck: AppCheckResult = Array.isArray(raw)
    ? { status: "invalid", reason: "duplicate x-firebase-appcheck header" }
    : await verifyAppCheckToken(raw);

  return { prisma, user, appCheck };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
