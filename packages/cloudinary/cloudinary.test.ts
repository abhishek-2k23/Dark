import { beforeAll, describe, expect, it } from "vitest";
import { v2 as cloudinary } from "cloudinary";
import { TRPCError } from "@trpc/server";

import {
  getUploadSignature,
  isAllowedMediaUrl,
  assertCloudinaryUrl,
  UPLOAD_PRESETS,
  type UploadKind,
} from "./index";

const CLOUD = "test-cloud";
const SECRET = "test-secret";

async function expectTRPCError(fn: () => unknown, code: string) {
  try {
    fn();
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

describe("getUploadSignature", () => {
  it("throws 412 when Cloudinary is not configured", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    await expectTRPCError(() => getUploadSignature("AVATAR"), "PRECONDITION_FAILED");
  });

  describe("when configured", () => {
    beforeAll(() => {
      process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
      process.env.CLOUDINARY_API_KEY = "test-key";
      process.env.CLOUDINARY_API_SECRET = SECRET;
    });

    it("returns the full signature shape with a verifiable signature", () => {
      const sig = getUploadSignature("AVATAR");
      expect(sig.cloudName).toBe(CLOUD);
      expect(sig.apiKey).toBe("test-key");
      expect(sig.folder).toBe("avatars");
      expect(sig.transformation).toBe(UPLOAD_PRESETS.AVATAR.transformation);
      expect(sig.uploadUrl).toBe(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`);
      expect(Math.abs(sig.timestamp - Date.now() / 1000)).toBeLessThan(5);

      // The signature must match what Cloudinary's own signer produces for
      // exactly the params the client is told to send.
      const expected = cloudinary.utils.api_sign_request(
        { timestamp: sig.timestamp, folder: sig.folder, transformation: sig.transformation },
        SECRET,
      );
      expect(sig.signature).toBe(expected);
    });

    it("every upload kind maps to its own folder", () => {
      const kinds: UploadKind[] = [
        "AVATAR",
        "VISITOR",
        "TICKET",
        "NOTICE",
        "AMENITY",
        "RECEIPT",
        "LOGO",
      ];
      const folders = kinds.map((kind) => getUploadSignature(kind).folder);
      expect(folders).toEqual([
        "avatars",
        "visitors",
        "tickets",
        "notices",
        "amenities",
        "receipts",
        "logos",
      ]);
      expect(new Set(folders).size).toBe(kinds.length);
    });

    it("signs every kind with its own transformation", () => {
      for (const kind of Object.keys(UPLOAD_PRESETS) as UploadKind[]) {
        const sig = getUploadSignature(kind);
        expect(sig.transformation, kind).toBe(UPLOAD_PRESETS[kind].transformation);
        expect(sig.signature, kind).toBe(
          cloudinary.utils.api_sign_request(
            { timestamp: sig.timestamp, folder: sig.folder, transformation: sig.transformation },
            SECRET,
          ),
        );
      }
    });
  });
});

describe("media URL validation", () => {
  beforeAll(() => {
    process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  });

  it("accepts delivery URLs of the configured cloud", () => {
    expect(isAllowedMediaUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/avatars/a.jpg`)).toBe(true);
    expect(() =>
      assertCloudinaryUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/tickets/t.png`),
    ).not.toThrow();
  });

  it("accepts undefined/null (optional inputs pass through)", () => {
    expect(() => assertCloudinaryUrl(undefined)).not.toThrow();
    expect(() => assertCloudinaryUrl(null)).not.toThrow();
  });

  it("rejects other hosts, other clouds, http, and garbage", async () => {
    const bad = [
      "https://evil.example.com/avatars/a.jpg",
      "https://res.cloudinary.com/other-cloud/image/upload/a.jpg",
      `http://res.cloudinary.com/${CLOUD}/image/upload/a.jpg`, // not https
      `https://res.cloudinary.com.evil.com/${CLOUD}/a.jpg`,
      "not a url at all",
    ];
    for (const url of bad) {
      expect(isAllowedMediaUrl(url), url).toBe(false);
      await expectTRPCError(() => assertCloudinaryUrl(url), "BAD_REQUEST");
    }
  });

  it("allows any URL when Cloudinary is not configured (dev mode)", () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(isAllowedMediaUrl("https://anything.example.com/a.jpg")).toBe(true);
  });
});
