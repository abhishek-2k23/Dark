import { prisma, type Role, type User } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serverRouter } from "../index";
import { tRPCContext } from "../trpc";
import type { AppCheckResult } from "@repo/auth";

/**
 * `appCheckGuard` must turn unattested callers away only when enforcement is on,
 * and never turn away the two endpoints the web app depends on. No database
 * needed — the guard sits on `publicProcedure` and runs before any resolver.
 */

const createCaller = tRPCContext.createCallerFactory(serverRouter);

/** The message `appCheckGuard` throws; the marker these tests look for. */
const BLOCKED = "This app build can no longer talk to the server. Please update Prangan.";

function fakeUser(role: Role): User {
  return {
    id: `fake-${role.toLowerCase()}`,
    name: `Fake ${role}`,
    email: `fake-${role.toLowerCase()}@test.local`,
    phone: null,
    passwordHash: null,
    authProvider: "LOCAL",
    googleId: null,
    avatarUrl: null,
    emailVerified: true,
    role,
    societyId: "fake-society",
    isActive: true,
    importedAt: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const caller = (appCheck: AppCheckResult, user: User | null = null) =>
  createCaller({ prisma, user, appCheck });

/** Runs a call and returns the message it failed with, or null if it did not. */
async function failureMessage(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

beforeEach(() => {
  process.env.FIREBASE_PROJECT_NUMBER = "1009774242772";
});

afterEach(() => {
  delete process.env.FIREBASE_PROJECT_NUMBER;
  delete process.env.APP_CHECK_ENFORCE;
});

describe("appCheckGuard in monitor mode (the default)", () => {
  it("lets an unattested caller through", async () => {
    // Fails on the role check, which proves it got past the guard.
    const message = await failureMessage(
      caller({ status: "missing" }, fakeUser("RESIDENT")).society.get(),
    );
    expect(message).not.toBe(BLOCKED);
  });

  it("lets a caller with an outright invalid token through", async () => {
    const message = await failureMessage(
      caller({ status: "invalid", reason: "expired" }, fakeUser("RESIDENT")).society.get(),
    );
    expect(message).not.toBe(BLOCKED);
  });
});

describe("appCheckGuard with APP_CHECK_ENFORCE=true", () => {
  beforeEach(() => {
    process.env.APP_CHECK_ENFORCE = "true";
  });

  it("rejects a caller with no token, before any role check", async () => {
    // An ADMIN would otherwise be allowed here.
    const promise = caller({ status: "missing" }, fakeUser("ADMIN")).society.get();
    await expect(promise).rejects.toThrow(BLOCKED);
    await expect(promise).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejects a caller whose token failed verification", async () => {
    await expect(
      caller({ status: "invalid", reason: "bad signature" }, fakeUser("ADMIN")).society.get(),
    ).rejects.toThrow(BLOCKED);
  });

  it("admits an attested caller", async () => {
    const message = await failureMessage(
      caller({ status: "valid", appId: "1:x:android:y" }, fakeUser("RESIDENT")).society.get(),
    );
    expect(message).not.toBe(BLOCKED);
  });

  it("never blocks over our own missing configuration", async () => {
    delete process.env.FIREBASE_PROJECT_NUMBER;
    const message = await failureMessage(
      caller({ status: "unconfigured" }, fakeUser("RESIDENT")).society.get(),
    );
    expect(message).not.toBe(BLOCKED);
  });

  it("keeps the web app's account-deletion endpoints reachable", async () => {
    // Whatever it fails on (no DB here), it must not be the guard.
    const message = await failureMessage(
      caller({ status: "missing" }).account.requestDeletion({ email: "nobody@test.local" }),
    );
    expect(message).not.toBe(BLOCKED);
  });
});
