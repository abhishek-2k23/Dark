import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type NoticeCategory } from "@repo/database";

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
    category: notice.category,
    isPinned: notice.isPinned,
    publishedBy: notice.publishedByAdmin,
    scheduledAt: notice.scheduledAt?.toISOString() ?? null,
    isPublished: !notice.scheduledAt || notice.scheduledAt <= new Date(),
    createdAt: notice.createdAt.toISOString(),
  };
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
    category: NoticeCategory;
    isPinned?: boolean;
    scheduledAt?: string;
  },
): Promise<NoticeInfo> {
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
      category: input.category,
      isPinned: input.isPinned ?? false,
      scheduledAt,
      publishedByAdminId: actor.id,
    },
    include: noticeInclude,
  });

  // TODO(Phase 8): NotificationService — push "notice published" to every
  // resident of the society (respecting scheduledAt for scheduled notices).

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
    category?: NoticeCategory;
    isPinned?: boolean;
    scheduledAt?: string | null;
  },
): Promise<NoticeInfo> {
  const notice = await requireOwnSocietyNotice(actor, input.noticeId);

  let scheduledAt: Date | null | undefined;
  if (input.scheduledAt === null) scheduledAt = null; // publish now
  else if (input.scheduledAt !== undefined) {
    scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "scheduledAt must be in the future — pass null to publish immediately",
      });
    }
  }

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data: {
      title: input.title,
      body: input.body,
      category: input.category,
      isPinned: input.isPinned,
      scheduledAt,
    },
    include: noticeInclude,
  });
  return toNoticeInfo(updated);
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
