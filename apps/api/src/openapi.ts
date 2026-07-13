import { generateOpenApiDocument } from "trpc-to-openapi";

import { serverRouter } from "@repo/trpc/server";

import { env } from "./env";

/**
 * The OpenAPI 3 document generated from every procedure in the app router
 * that carries `meta.openapi` (see docs/api-conventions.md for the
 * per-endpoint checklist). Served live at /openapi.json and written to
 * docs/openapi.json by `pnpm openapi:generate`.
 */
export const openApiDocument = generateOpenApiDocument(serverRouter, {
  title: "Portl API",
  version: "1.0.0",
  description:
    "Society-management API: authentication, visitor management, helpdesk, " +
    "notices, polls, amenities, dues, and staff directory. All REST paths " +
    "are namespaced under /api/v1.",
  baseUrl: `${env.BASE_URL}/api`,
  docsUrl: `${env.BASE_URL}/docs`,
});

// TODO(deploy, Phase 17): add staging + prod entries to `servers` once those
// environments exist — until then the doc lists only the local server.
