import { z } from "zod";

export const zodUndefinedModel = z.undefined().describe("undefined");

/**
 * A phone number: exactly 10 digits, no country code or separators
 * (e.g. "9876543210"). Shared by every phone input across the API so the
 * validation stays consistent with the 10-digit limit enforced in the app.
 */
export const phoneSchema = z
  .string()
  .regex(/^\d{10}$/, "Enter a 10-digit phone number");

/**
 * Society committee title carried by an ADMIN account. Mirrors the
 * `AdminDesignation` Prisma enum — keep the two in sync.
 */
export const AdminDesignationEnum = z
  .enum([
    "PRESIDENT",
    "SECRETARY",
    "TREASURER",
    "COMMITTEE_MEMBER",
    "MANAGER",
    "OTHER",
  ])
  .describe("Society committee title (ADMIN role only)");

export { z };
