import { getUploadSignature } from "@repo/cloudinary";

import { z } from "../../schema";
import { protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/uploads");

const UploadKindEnum = z
  .enum(["AVATAR", "VISITOR", "TICKET", "NOTICE", "AMENITY", "RECEIPT", "LOGO"])
  .describe(
    "What the image is for — picks the Cloudinary folder and transformation: " +
      "AVATAR (square face-crop), VISITOR (fixed aspect), TICKET (size-capped original), " +
      "NOTICE (banner aspect), AMENITY (3:2 gallery), RECEIPT (size-capped, max quality " +
      "so small print stays legible), LOGO (fit, no crop)",
  );

const GetSignatureInput = z.object({
  kind: UploadKindEnum,
});

const UploadSignatureModel = z
  .object({
    cloudName: z.string().describe("Cloudinary cloud name"),
    apiKey: z.string().describe("Cloudinary API key (public; include as 'api_key')"),
    timestamp: z
      .number()
      .describe("Unix seconds the signature was made; include as 'timestamp' — valid ~1 hour"),
    folder: z.string().describe("Include verbatim as 'folder'"),
    transformation: z.string().describe("Include verbatim as 'transformation'"),
    signature: z.string().describe("Include as 'signature'"),
    uploadUrl: z.string().describe("POST the multipart form to this URL"),
  })
  .describe("Everything the client needs for one signed direct upload");

export const uploadRouter = router({
  getSignature: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("signature"),
        tags: ["Uploads"],
        summary: "Get a signature for a direct Cloudinary upload",
        description:
          "Two-step upload flow: (1) call this endpoint to get a short-lived signature; " +
          "(2) POST the image as multipart form-data to uploadUrl with fields file, api_key, " +
          "timestamp, folder, transformation, and signature — exactly as returned here. " +
          "Cloudinary responds with a secure_url; send that URL to whichever mutation stores " +
          "it (profile.update, visitor.register, ticket.create, …). The backend rejects media " +
          "URLs that are not from this app's Cloudinary cloud. Errors: 401 if not " +
          "authenticated, 412 if uploads are not configured on the server.",
        protect: true,
      },
    })
    .input(GetSignatureInput)
    .output(UploadSignatureModel)
    .mutation(({ input }) => getUploadSignature(input.kind)),
});
