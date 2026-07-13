import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, router } from "../../trpc";

export const healthRouter = router({
  getHealth: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/health",
        tags: ["Health"],
        summary: "Health check",
        description:
          "Liveness probe. Returns `{ status: \"healthy\" }` with a 200 when the API process " +
          "is up and able to serve requests. Public — no authentication required.",
      },
    })
    .input(zodUndefinedModel)
    .output(
      z.object({
        status: z.literal("healthy").describe("status of the server"),
      }),
    )
    .query(async () => {
      return {
        status: "healthy",
      };
    }),
});
