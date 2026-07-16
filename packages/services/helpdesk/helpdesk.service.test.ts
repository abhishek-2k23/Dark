import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

// Raising a ticket emails its reference to the resident, and the repo .env
// carries live SMTP credentials — without this the suite sends real mail.
const sentTicketEmails = vi.hoisted(
  () => [] as { to: string; referenceCode: string; title: string }[],
);
vi.mock("@repo/mailer", () => ({
  isMailerConfigured: () => false,
  sendTicketRaisedEmail: vi.fn(async (p: (typeof sentTicketEmails)[number]) => {
    sentTicketEmails.push(p);
  }),
  sendGuestPassEmail: vi.fn(async () => {}),
  sendOtpEmail: vi.fn(async () => {}),
  sendAccountDeletionOtpEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendMail: vi.fn(async () => {}),
}));

import * as helpdeskService from "./helpdesk.service";

const runId = `hd-${Date.now().toString(36)}`;

let societyId: string;
let resident: User;
let otherResident: User;
let admin: User;
let otherSocietyAdmin: User;
let guard: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `HD Society ${runId}`,
      address: "1 HD St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const otherSociety = await prisma.society.create({
    data: {
      name: `HD Other ${runId}`,
      address: "2 HD St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });

  const tower = await prisma.tower.create({ data: { societyId, name: `HT-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "H-101", floor: 1, type: "TWO_BHK" },
  });
  const flat2 = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "H-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "GUARD" | "RESIDENT" | "ADMIN", sid: string, flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  resident = await mkUser("HD Resident", "RESIDENT", societyId, flat.id);
  otherResident = await mkUser("HD Other Resident", "RESIDENT", societyId, flat2.id);
  admin = await mkUser("HD Admin", "ADMIN", societyId);
  guard = await mkUser("HD Guard", "GUARD", societyId);
  otherSocietyAdmin = await mkUser("HD Foreign Admin", "ADMIN", otherSociety.id);
});

afterAll(async () => {
  const societies = await prisma.society.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  });
  const societyIds = societies.map((s) => s.id);
  await prisma.ticketComment.deleteMany({
    where: { ticket: { flat: { tower: { societyId: { in: societyIds } } } } },
  });
  await prisma.helpdeskTicket.deleteMany({
    where: { flat: { tower: { societyId: { in: societyIds } } } },
  });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("ticket lifecycle", () => {
  let ticketId: string;

  it("resident raises a ticket (OPEN, MEDIUM by default)", async () => {
    const ticket = await helpdeskService.createTicket(resident, {
      category: "PLUMBING",
      title: "Leaky tap",
      description: "Kitchen tap drips constantly",
    });
    ticketId = ticket.id;
    expect(ticket.status).toBe("OPEN");
    expect(ticket.priority).toBe("MEDIUM");
    expect(ticket.raisedBy.id).toBe(resident.id);
  });

  it("admin assigns the ticket to a guard", async () => {
    const ticket = await helpdeskService.assignTicket(admin, {
      ticketId,
      assigneeId: guard.id,
    });
    expect(ticket.assignedTo?.id).toBe(guard.id);
  });

  it("rejects assigning to a resident", async () => {
    await expectTRPCError(
      helpdeskService.assignTicket(admin, { ticketId, assigneeId: otherResident.id }),
      "NOT_FOUND",
    );
  });

  it("the assignee moves the status forward; the owner cannot", async () => {
    const inProgress = await helpdeskService.updateTicketStatus(guard, {
      ticketId,
      status: "IN_PROGRESS",
    });
    expect(inProgress.status).toBe("IN_PROGRESS");

    await expectTRPCError(
      helpdeskService.updateTicketStatus(resident, { ticketId, status: "CLOSED" }),
      "FORBIDDEN",
    );
  });

  it("owner, assignee, and admin can comment; the thread is readable via get", async () => {
    await helpdeskService.addComment(resident, { ticketId, message: "Any update?" });
    await helpdeskService.addComment(guard, { ticketId, message: "Fixing tomorrow" });
    await helpdeskService.addComment(admin, { ticketId, message: "Please expedite" });

    const detail = await helpdeskService.getTicket(resident, { ticketId });
    expect(detail.comments).toHaveLength(3);
    expect(detail.comments.map((c) => c.author.id)).toEqual([resident.id, guard.id, admin.id]);
    expect(detail.commentCount).toBe(3);
  });

  it("admin resolves and closes", async () => {
    await helpdeskService.updateTicketStatus(admin, { ticketId, status: "RESOLVED" });
    const closed = await helpdeskService.updateTicketStatus(admin, {
      ticketId,
      status: "CLOSED",
    });
    expect(closed.status).toBe("CLOSED");
  });
});

describe("access scoping", () => {
  let ticketId: string;

  beforeAll(async () => {
    const ticket = await helpdeskService.createTicket(resident, {
      category: "SECURITY",
      title: "Broken gate light",
      description: "Light near gate 2 is out",
      priority: "HIGH",
    });
    ticketId = ticket.id;
  });

  it("another resident cannot see or comment on the ticket", async () => {
    await expectTRPCError(helpdeskService.getTicket(otherResident, { ticketId }), "NOT_FOUND");
    await expectTRPCError(
      helpdeskService.addComment(otherResident, { ticketId, message: "Nosy" }),
      "NOT_FOUND",
    );
  });

  it("an admin of another society cannot see the ticket", async () => {
    await expectTRPCError(
      helpdeskService.getTicket(otherSocietyAdmin, { ticketId }),
      "NOT_FOUND",
    );
  });

  it("an unassigned guard cannot change status", async () => {
    // guard is assigned to the lifecycle ticket, not this one.
    await expectTRPCError(
      helpdeskService.updateTicketStatus(guard, { ticketId, status: "CLOSED" }),
      "NOT_FOUND",
    );
  });

  it("residents list only their own tickets; admins list the society's; guards get 403", async () => {
    const mine = await helpdeskService.listTickets(resident, { limit: 50 });
    expect(mine.items.every((t) => t.raisedBy.id === resident.id)).toBe(true);
    expect(mine.items.length).toBeGreaterThanOrEqual(2);

    const all = await helpdeskService.listTickets(admin, { limit: 50 });
    expect(all.items.length).toBeGreaterThanOrEqual(mine.items.length);

    const filtered = await helpdeskService.listTickets(admin, {
      priority: "HIGH",
      limit: 50,
    });
    expect(filtered.items.every((t) => t.priority === "HIGH")).toBe(true);
    expect(filtered.items.length).toBeGreaterThanOrEqual(1);

    await expectTRPCError(helpdeskService.listTickets(guard, { limit: 50 }), "FORBIDDEN");
  });
});

describe("ticket reference codes", () => {
  const raise = (title: string) =>
    helpdeskService.createTicket(resident, {
      category: "PLUMBING",
      title,
      description: "Reference code coverage",
    });

  it("stamps a readable TKT- code and emails it to the resident", async () => {
    sentTicketEmails.length = 0;
    const ticket = await raise("Reference code ticket");

    expect(ticket.referenceCode).toMatch(/^TKT-[0-9A-HJKMNP-TV-Z]{6}$/);

    expect(sentTicketEmails).toHaveLength(1);
    expect(sentTicketEmails[0]!.to).toBe(resident.email);
    // The emailed reference must be the one actually stored, or it's useless.
    expect(sentTicketEmails[0]!.referenceCode).toBe(ticket.referenceCode);
  });

  it("never reuses a code", async () => {
    const codes = await Promise.all([
      raise("Unique 1"),
      raise("Unique 2"),
      raise("Unique 3"),
      raise("Unique 4"),
    ]).then((ts) => ts.map((t) => t.referenceCode));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("omits the ambiguous characters I, L, O and U", async () => {
    const ticket = await raise("Alphabet check");
    // These are the ones that get misread as 1/0 or misheard on a call.
    expect(ticket.referenceCode.slice(4)).not.toMatch(/[ILOU]/);
  });

  it("a mail failure does not fail the raise", async () => {
    const mailer = await import("@repo/mailer");
    vi.mocked(mailer.sendTicketRaisedEmail).mockRejectedValueOnce(new Error("SMTP down"));
    const ticket = await raise("Undeliverable reference");
    expect(ticket.referenceCode).toBeTruthy();
    expect(ticket.status).toBe("OPEN");
  });
});
