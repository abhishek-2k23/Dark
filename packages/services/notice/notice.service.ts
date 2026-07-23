import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type NoticeCategory } from "@repo/database";
import { assertCloudinaryUrl } from "@repo/cloudinary";

import { notifyUsers, societyResidentUserIds } from "../notification/notification.service";

/**
 * Society notice board. Admins manage notices (including future-scheduled
 * ones); everyone else sees only published notices — those with no
 * scheduledAt or whose scheduledAt has passed.
 */

const noticeInclude = {
  publishedByAdmin: { select: { id: true, name: true } },
} satisfies Prisma.NoticeInclude;

type NoticeRow = Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>;

export interface NoticeInfo {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  category: NoticeCategory;
  isPinned: boolean;
  publishedBy: { id: string; name: string };
  scheduledAt: string | null;
  isPublished: boolean;
  createdAt: string;
}

function toNoticeInfo(notice: NoticeRow): NoticeInfo {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    imageUrl: notice.imageUrl,
    category: notice.category,
    isPinned: notice.isPinned,
    publishedBy: notice.publishedByAdmin,
    scheduledAt: notice.scheduledAt?.toISOString() ?? null,
    isPublished: !notice.scheduledAt || notice.scheduledAt <= new Date(),
    createdAt: notice.createdAt.toISOString(),
  };
}

/** Push body: the notice text, trimmed to a notification-sized preview. */
function noticeSummary(body: string): string {
  return body.length > 120 ? `${body.slice(0, 117)}...` : body;
}

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

export async function createNotice(
  actor: User,
  input: {
    title: string;
    body: string;
    imageUrl?: string | null;
    category: NoticeCategory;
    isPinned?: boolean;
    scheduledAt?: string;
  },
): Promise<NoticeInfo> {
  assertCloudinaryUrl(input.imageUrl);
  const societyId = actorSocietyId(actor);
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt <= new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "scheduledAt must be in the future — omit it to publish immediately",
    });
  }

  const notice = await prisma.notice.create({
    data: {
      societyId,
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl,
      category: input.category,
      isPinned: input.isPinned ?? false,
      scheduledAt,
      // Immediate notices are pushed right below, so they're already notified;
      // scheduled ones stay owed (null) until publishDueNotices sends the push.
      notifiedAt: scheduledAt ? null : new Date(),
      publishedByAdminId: actor.id,
    },
    include: noticeInclude,
  });

  if (!scheduledAt) {
    await notifyUsers(await societyResidentUserIds(societyId), {
      type: "NOTICE_PUBLISHED",
      title: `Notice: ${notice.title}`,
      body: noticeSummary(notice.body),
      data: { noticeId: notice.id },
    });
  }

  return toNoticeInfo(notice);
}

async function requireOwnSocietyNotice(actor: User, noticeId: string) {
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId, societyId: actorSocietyId(actor) },
  });
  if (!notice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Notice not found" });
  }
  return notice;
}

export async function updateNotice(
  actor: User,
  input: {
    noticeId: string;
    title?: string;
    body?: string;
    /** undefined leaves the current banner alone; null clears it. */
    imageUrl?: string | null;
    category?: NoticeCategory;
    isPinned?: boolean;
    scheduledAt?: string | null;
  },
): Promise<NoticeInfo> {
  assertCloudinaryUrl(input.imageUrl);
  const notice = await requireOwnSocietyNotice(actor, input.noticeId);

  let scheduledAt: Date | null | undefined;
  if (input.scheduledAt === null)
    scheduledAt = null; // publish now
  else if (input.scheduledAt !== undefined) {
    scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "scheduledAt must be in the future — pass null to publish immediately",
      });
    }
  }

  // Was this notice still hidden from residents before this edit?
  const wasUnpublished = !!notice.scheduledAt && notice.scheduledAt > new Date();
  const publishNow = wasUnpublished && scheduledAt === null;

  // Keep notifiedAt in sync with the publish state so the sweep stays correct:
  // publishing now counts as the (one) push; (re)scheduling to a future time
  // re-arms the sweep to push again when that new time passes.
  let notifiedAt: Date | null | undefined;
  if (publishNow) notifiedAt = new Date();
  else if (scheduledAt instanceof Date) notifiedAt = null;

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data: {
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl,
      category: input.category,
      isPinned: input.isPinned,
      scheduledAt,
      notifiedAt,
    },
    include: noticeInclude,
  });

  // Publish-now transition: this is the moment residents can see it, so notify.
  if (publishNow) {
    await notifyUsers(await societyResidentUserIds(notice.societyId), {
      type: "NOTICE_PUBLISHED",
      title: `Notice: ${updated.title}`,
      body: noticeSummary(updated.body),
      data: { noticeId: updated.id },
    });
  }

  return toNoticeInfo(updated);
}

/**
 * Publish-time push for scheduled notices. Finds notices whose scheduledAt has
 * passed but that residents were never pushed about (notifiedAt null), pushes
 * them, and stamps notifiedAt so each is announced exactly once.
 *
 * Marks notifiedAt *before* pushing: a duplicate push (if two sweeps overlap)
 * is worse than a missed one, and the every-minute cadence means a rare dropped
 * push is invisible in practice. Runs on the API's periodic expiry sweep.
 */
export async function publishDueNotices(): Promise<number> {
  const now = new Date();
  const due = await prisma.notice.findMany({
    where: { scheduledAt: { not: null, lte: now }, notifiedAt: null },
    select: { id: true, societyId: true, title: true, body: true },
  });
  if (due.length === 0) return 0;

  await prisma.notice.updateMany({
    where: { id: { in: due.map((n) => n.id) } },
    data: { notifiedAt: now },
  });

  for (const notice of due) {
    await notifyUsers(await societyResidentUserIds(notice.societyId), {
      type: "NOTICE_PUBLISHED",
      title: `Notice: ${notice.title}`,
      body: noticeSummary(notice.body),
      data: { noticeId: notice.id },
    });
  }

  return due.length;
}

export async function deleteNotice(actor: User, input: { noticeId: string }): Promise<void> {
  const notice = await requireOwnSocietyNotice(actor, input.noticeId);
  await prisma.notice.delete({ where: { id: notice.id } });
}

/**
 * Admins see everything (including future-scheduled notices); residents and
 * guards see only published ones. Pinned notices sort first.
 */
export async function listNotices(
  actor: User,
  input: { category?: NoticeCategory; cursor?: string; limit: number },
): Promise<{ items: NoticeInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);
  const publishedOnly: Prisma.NoticeWhereInput =
    actor.role === "ADMIN"
      ? {}
      : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] };

  const notices = await prisma.notice.findMany({
    where: {
      societyId,
      ...(input.category ? { category: input.category } : {}),
      ...publishedOnly,
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: noticeInclude,
  });

  const hasMore = notices.length > input.limit;
  const items = (hasMore ? notices.slice(0, input.limit) : notices).map(toNoticeInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
