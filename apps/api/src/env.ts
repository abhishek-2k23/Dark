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
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** Rate-limit window for auth endpoints, in minutes. */
  AUTH_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
