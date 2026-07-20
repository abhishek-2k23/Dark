import { describe, expect, it } from "vitest";

import {
  generatePassCode,
  generateUniquePassCode,
  isPassCodeShaped,
  normalisePassCode,
} from "./pass-code";

describe("generatePassCode", () => {
  it("is always 6 characters: 4 digits and 2 letters", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generatePassCode();
      expect(code).toHaveLength(6);
      expect(code.replace(/[^0-9]/g, "")).toHaveLength(4);
      expect(code.replace(/[^A-Z]/g, "")).toHaveLength(2);
    }
  });

  it("never emits a letter that can be misread as a digit", () => {
    // B/8, I/1, O/0, S/5, Z/2 — the pairs a guard would confuse reading aloud.
    for (let i = 0; i < 2000; i++) {
      expect(generatePassCode()).not.toMatch(/[BIOSZ]/);
    }
  });

  it("puts the letters in varying positions", () => {
    // Guards against a regression to a fixed layout like "AB1234", which would
    // cost 15x of the keyspace.
    const layouts = new Set<string>();
    for (let i = 0; i < 500; i++) {
      layouts.add(generatePassCode().replace(/[0-9]/g, "#").replace(/[A-Z]/g, "@"));
    }
    expect(layouts.size).toBeGreaterThan(5);
  });
});

describe("normalisePassCode", () => {
  it("uppercases and strips what a human types around the code", () => {
    expect(normalisePassCode("  ab-12 34 ")).toBe("AB1234");
    expect(normalisePassCode("4a72k9")).toBe("4A72K9");
  });
});

describe("isPassCodeShaped", () => {
  it("accepts a well-formed code, in any typed form", () => {
    expect(isPassCodeShaped("4A72K9")).toBe(true);
    expect(isPassCodeShaped("4a72-k9")).toBe(true);
  });

  it("rejects wrong lengths and wrong digit/letter splits", () => {
    expect(isPassCodeShaped("")).toBe(false);
    expect(isPassCodeShaped("4A72K")).toBe(false); // too short
    expect(isPassCodeShaped("4A72K99")).toBe(false); // too long
    expect(isPassCodeShaped("ABC123")).toBe(false); // 3 letters — over the cap
    expect(isPassCodeShaped("123456")).toBe(false); // no letters
    expect(isPassCodeShaped("deadbeefdeadbeef")).toBe(false); // an old hex token
  });

  it("accepts every code the generator produces", () => {
    for (let i = 0; i < 1000; i++) {
      expect(isPassCodeShaped(generatePassCode())).toBe(true);
    }
  });
});

describe("generateUniquePassCode", () => {
  it("retries past codes that are already taken", async () => {
    const taken = new Set<string>();
    const first = generatePassCode();
    taken.add(first);

    const code = await generateUniquePassCode(async (c) => taken.has(c));
    expect(code).not.toBe(first);
    expect(isPassCodeShaped(code)).toBe(true);
  });

  it("gives up rather than looping forever when nothing is free", async () => {
    await expect(generateUniquePassCode(async () => true, 3)).rejects.toThrow(
      /unused pass code/,
    );
  });
});
