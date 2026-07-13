import { prisma, type User } from "@repo/database";
import { verifyAccessToken } from "@repo/auth";

interface ContextRequest {
  headers: { authorization?: string | undefined };
}

/**
 * Shared context for both the tRPC adapter and the trpc-to-openapi REST
 * middleware. Parses the `Authorization: Bearer <accessToken>` header and
 * attaches the active user (or null for anonymous callers).
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

  return { prisma, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
