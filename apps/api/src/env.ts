import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(["development", "prod"]).default("development"),
  BASE_URL: z.string().default("http://localhost:8000"),
  /**
   * Comma-separated list of origins allowed by CORS in prod
   * (e.g. "https://app.portl.example,https://admin.portl.example").
   * Ignored in development, where all origins are allowed.
   */
  ALLOWED_ORIGINS: z.string().optional(),
  /** Max requests per window on sensitive auth endpoints (login/signup/etc.). */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  /** Rate-limit window for auth endpoints, in minutes. */
  AUTH_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(50),
  /** Minutes before an unanswered PENDING visitor request auto-EXPIREs. */
  VISITOR_PENDING_TTL_MIN: z.coerce.number().int().positive().default(50),
  /**
   * Minutes between keep-alive self-pings. Render's free tier spins an instance
   * down after 15 minutes with no inbound request, so this must stay comfortably
   * under 15. Set to 0 to disable (e.g. on a paid instance, which never idles).
   */
  KEEP_ALIVE_INTERVAL_MIN: z.coerce.number().int().nonnegative().default(10),
  /**
   * URL the keep-alive ping hits. Defaults to `${BASE_URL}/health`. It must be
   * the service's PUBLIC url — a request to localhost never reaches Render's
   * router and so does not count as activity.
   */
  KEEP_ALIVE_URL: z.string().url().optional(),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
