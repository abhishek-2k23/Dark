import { noticeService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, subscribedAdminProcedure, protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/notices");

const NoticeCategoryEnum = z
  .enum(["MAINTENANCE", "EVENT", "EMERGENCY", "GENERAL"])
  .describe("Notice category");

const NoticeModel = z
  .object({
    id: z.string().describe("Notice id"),
    title: z.string().describe("Notice title"),
    body: z.string().describe("Notice body text"),
    imageUrl: z.string().nullable().describe("Banner image URL, if set"),
    category: NoticeCategoryEnum,
    isPinned: z.boolean().describe("Pinned notices sort to the top"),
    publishedBy: z
      .object({
        id: z.string().describe("User id"),
        name: z.string().describe("Full name"),
      })
      .describe("Admin who published the notice"),
    scheduledAt: z
      .string()
      .nullable()
      .describe("ISO future-publish time; null means published on creation"),
    isPublished: z.boolean().describe("Whether the notice is currently visible to residents"),
    createdAt: z.string().describe("ISO creation time"),
  })
  .describe("A society notice");

const CreateNoticeInput = z.object({
  title: z.string().min(1).describe("Notice title"),
  body: z.string().min(1).describe("Notice body text"),
  imageUrl: z.url().nullish().describe("Banner image URL (Cloudinary NOTICE kind)"),
  category: NoticeCategoryEnum,
  isPinned: z.boolean().describe("Pin to the top of the board (default false)").optional(),
  scheduledAt: z.iso
    .datetime()
    .describe("ISO future time to auto-publish; omit to publish immediately")
    .optional(),
});

const UpdateNoticeInput = z.object({
  noticeId: z.string().describe("Id of the notice to update"),
  title: z.string().min(1).describe("New title").optional(),
  body: z.string().min(1).describe("New body").optional(),
  imageUrl: z.url().nullish().describe("New banner image URL; null clears it"),
  category: NoticeCategoryEnum.optional(),
  isPinned: z.boolean().describe("New pinned state").optional(),
  scheduledAt: z.iso
    .datetime()
    .describe("New future-publish time; pass null to publish immediately")
    .nullable()
    .optional(),
});

const NoticeIdInput = z.object({
  noticeId: z.string().describe("Id of the notice"),
});

const ListNoticesInput = z.object({
  category: NoticeCategoryEnum.describe("Only notices in this category").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last notice from the previous page").optional(),
});

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

export const noticeRouter = router({
  create: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Notices"],
        summary: "Publish or schedule a notice",
        description:
          "Creates a notice for the admin's society. With scheduledAt set (must be future) " +
          "the notice stays hidden from residents until that time. Errors: 400 if " +
          "scheduledAt is in the past, 403 if not an admin.",
        protect: true,
      },
    })
    .input(CreateNoticeInput)
    .output(NoticeModel)
    .mutation(({ ctx, input }) => noticeService.createNotice(ctx.user, input)),

  update: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("{noticeId}"),
        tags: ["Notices"],
        summary: "Update a notice",
        description:
          "Partially updates a notice of the admin's society; pass scheduledAt null to " +
          "publish a scheduled notice immediately. Errors: 400 if scheduledAt is in the " +
          "past, 403 if not an admin, 404 if the notice is not in the admin's society.",
        protect: true,
      },
    })
    .input(UpdateNoticeInput)
    .output(NoticeModel)
    .mutation(({ ctx, input }) => noticeService.updateNotice(ctx.user, input)),

  delete: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("{noticeId}"),
        tags: ["Notices"],
        summary: "Delete a notice",
        description:
          "Removes a notice from the admin's society board. Errors: 403 if not an admin, " +
          "404 if the notice is not in the admin's society.",
        protect: true,
      },
    })
    .input(NoticeIdInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await noticeService.deleteNotice(ctx.user, input);
      return { success: true as const };
    }),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Notices"],
        summary: "List notices (role-aware visibility)",
        description:
          "Cursor-paginated notice board, pinned first. Residents and guards see only " +
          "published notices; admins also see future-scheduled ones (check isPublished). " +
          "Errors: 401 if not authenticated, 412 if the account is not linked to a society.",
        protect: true,
      },
    })
    .input(ListNoticesInput)
    .output(
      z.object({
        items: z.array(NoticeModel).describe("Notices on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => noticeService.listNotices(ctx.user, input)),
});
