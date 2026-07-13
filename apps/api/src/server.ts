import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { logger } from "@repo/logger";

import * as trpcExpress from "@trpc/server/adapters/express";
import { createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/trpc/server";

import { env } from "./env";
import { openApiDocument } from "./openapi";

export const app = express();

// Security headers. CSP is disabled because the Scalar docs UI at /docs needs
// inline scripts/styles; every other route only ever serves JSON.
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins =
  env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

if (env.NODE_ENV !== "prod") {
  app.use(cors({ origin: "*" }));
} else if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins }));
}
// Prod with no ALLOWED_ORIGINS sends no CORS headers at all: browsers are
// locked out cross-origin, while native mobile clients (which send no Origin
// header) are unaffected.

app.use(express.json());

/**
 * Brute-force protection on the credential/token-issuing endpoints, covering
 * both the REST (/api/v1/...) and native tRPC (/trpc/auth.*) surfaces.
 * Deliberately excludes /refresh — legitimate clients hit it every ~15 min.
 * Note: tRPC clients must not batch these calls (a batched URL like
 * /trpc/auth.login,auth.me would bypass the path match) — see
 * docs/api-conventions.md.
 */
const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts, please try again later",
    code: "TOO_MANY_REQUESTS",
  },
});
app.use(
  [
    "/api/v1/auth/login",
    "/api/v1/auth/signup",
    "/api/v1/auth/google",
    "/api/v1/auth/password-reset/request",
    "/api/v1/auth/password-reset/confirm",
    "/trpc/auth.login",
    "/trpc/auth.signup",
    "/trpc/auth.googleLogin",
    "/trpc/auth.requestPasswordReset",
    "/trpc/auth.resetPassword",
  ],
  authLimiter,
);

app.get("/", (req, res) => {
  return res.json({ message: "Portal is up and running..." });
});

app.get("/health", (req, res) => {
  return res.json({ message: "Portal server is healthy", healthy: true });
});

logger.debug(`openapi.json: ${env.BASE_URL}/openapi.json`);
app.get("/openapi.json", (req, res) => {
  return res.json(openApiDocument);
});

logger.debug(`docs: ${env.BASE_URL}/docs`);
app.use("/docs", apiReference({ url: "/openapi.json" }));

/** Unexpected (5xx) errors are logged with their procedure path; expected
 *  TRPCErrors (4xx) are already part of each endpoint's contract. */
const logUnexpectedError = ({ error, path }: { error: { code: string }; path?: string }) => {
  if (error.code === "INTERNAL_SERVER_ERROR") {
    logger.error(`Unhandled error in procedure '${path ?? "<unknown>"}'`, { error });
  }
};

app.use(
  "/api",
  createOpenApiExpressMiddleware({
    router: serverRouter,
    createContext,
    onError: logUnexpectedError,
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
    onError: logUnexpectedError,
  }),
);

export default app;
