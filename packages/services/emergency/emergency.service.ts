import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type EmergencyStatus,
  type EmergencyType,
} from "@repo/database";

import { notifyUsers, societyAllUserIds } from "../notification/notification.service";

/**
 * Society-wide panic alarm.
 *
 * Any member — resident, guard, or admin — can raise one, and it fans out to
 * everyone else in the society at once. Two things make this different from
 * every other notification in the app:
 *
 *  - It is the only broadcast that ignores role boundaries. A fire does not
 *    care who spotted it.
 *  - It overrides the app's silent-in-foreground rule (see push.ts), because
 *    an alarm nobody hears is not an alarm.
 *
 * Resolution is deliberately open to any member rather than gated to admins:
 * the person best placed to sound the all-clear is whoever reached the scene.
 */

const alertInclude = {
  raisedBy: { select: { id: true, name: true, phone: true } },
  resolvedBy: { select: { id: true, name: true } },
  flat: { include: { tower: { select: { name: true } } } },
} satisfies Prisma.EmergencyAlertInclude;

type AlertRow = Prisma.EmergencyAlertGetPayload<{ include: typeof alertInclude }>;

export interface EmergencyAlertInfo {
  id: string;
  type: EmergencyType;
  note: string | null;
  status: EmergencyStatus;
  /** Phone is carried so a responder can call back without a second lookup. */
  raisedBy: { id: string; name: string; phone: string | null };
  /** "A-101" when the alarm came from a flat; null for gate/office staff. */
  flatLabel: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  createdAt: string;
}

function toAlertInfo(row: AlertRow): EmergencyAlertInfo {
  return {
    id: row.id,
    type: row.type,
    note: row.note,
    status: row.status,
    raisedBy: row.raisedBy,
    flatLabel: row.flat ? `${row.flat.tower.name}-${row.flat.flatNumber}` : null,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
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

/** Human-readable lead for the push title, e.g. "Medical emergency". */
const TYPE_LABEL: Record<EmergencyType, string> = {
  MEDICAL: "Medical emergency",
  FIRE: "Fire",
  SECURITY: "Security alert",
  OTHER: "Emergency",
};

/**
 * How long the same person's alarm of the same type is treated as a repeat
 * rather than a new incident. Shaking a phone hard tends to fire more than once,
 * and a panicking user taps more than once — neither should light up the society
 * twice.
 */
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

export async function raiseEmergency(
  actor: User,
  input: { type: EmergencyType; note?: string },
): Promise<EmergencyAlertInfo> {
  const societyId = actorSocietyId(actor);

  // Collapse onto the caller's own live alarm of the same type instead of
  // raising a second one. Returning the existing alert (rather than erroring)
  // keeps the client simple: the SOS screen shows a live alarm either way.
  const existing = await prisma.emergencyAlert.findFirst({
    where: {
      societyId,
      raisedById: actor.id,
      type: input.type,
      status: "ACTIVE",
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    include: alertInclude,
  });
  if (existing) return toAlertInfo(existing);

  // Guards and admins have no flat; residents get theirs stamped on the alert.
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { flatId: true },
  });

  const alert = await prisma.emergencyAlert.create({
    data: {
      societyId,
      type: input.type,
      note: input.note,
      raisedById: actor.id,
      flatId: profile?.flatId ?? null,
    },
    include: alertInclude,
  });

  const where = alert.flat
    ? `${alert.flat.tower.name}-${alert.flat.flatNumber}`
    : actor.role === "GUARD"
      ? "the gate"
      : "the society office";

  await notifyUsers(await societyAllUserIds(societyId, actor.id), {
    type: "EMERGENCY_RAISED",
    title: `🚨 ${TYPE_LABEL[alert.type]} at ${where}`,
    body: alert.note?.trim()
      ? `${actor.name}: ${alert.note.trim()}`
      : `${actor.name} raised an emergency alarm. Help if you can.`,
    data: { emergencyId: alert.id, emergencyType: alert.type },
  });

  return toAlertInfo(alert);
}

/**
 * Sound the all-clear. Open to any member of the society, not just admins — see
 * the note at the top of this file. Resolving an already-resolved alert is a
 * conflict rather than a no-op so two responders racing each other both find
 * out what actually happened.
 */
export async function resolveEmergency(
  actor: User,
  input: { emergencyId: string },
): Promise<EmergencyAlertInfo> {
  const societyId = actorSocietyId(actor);

  const alert = await prisma.emergencyAlert.findFirst({
    where: { id: input.emergencyId, societyId },
  });
  if (!alert) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Emergency alert not found" });
  }
  if (alert.status === "RESOLVED") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This alarm has already been marked resolved",
    });
  }

  const resolved = await prisma.emergencyAlert.update({
    where: { id: alert.id },
    data: { status: "RESOLVED", resolvedById: actor.id, resolvedAt: new Date() },
    include: alertInclude,
  });

  // The all-clear goes to everyone the alarm did, including whoever raised it —
  // they most of all want to know someone responded.
  await notifyUsers(await societyAllUserIds(societyId, actor.id), {
    type: "EMERGENCY_RESOLVED",
    title: "All clear",
    body: `${actor.name} marked the ${TYPE_LABEL[resolved.type].toLowerCase()} as resolved.`,
    data: { emergencyId: resolved.id },
  });

  return toAlertInfo(resolved);
}

/**
 * Live alarms in the caller's society, newest first. Drives the persistent
 * banner, so it is deliberately cheap and unpaginated — more than a handful of
 * simultaneous alarms is not a case worth paging through.
 */
export async function listActiveEmergencies(actor: User): Promise<EmergencyAlertInfo[]> {
  const rows = await prisma.emergencyAlert.findMany({
    where: { societyId: actorSocietyId(actor), status: "ACTIVE" },
    include: alertInclude,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map(toAlertInfo);
}

export async function listEmergencies(
  actor: User,
  input: { status?: EmergencyStatus; limit: number; cursor?: string },
): Promise<{ items: EmergencyAlertInfo[]; nextCursor: string | null }> {
  const rows = await prisma.emergencyAlert.findMany({
    where: {
      societyId: actorSocietyId(actor),
      ...(input.status ? { status: input.status } : {}),
    },
    include: alertInclude,
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map(toAlertInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
