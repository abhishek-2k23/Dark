import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as pollService from "./poll.service";

const runId = `pl-${Date.now().toString(36)}`;
const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

let societyId: string;
let admin: User;
let residentA: User;
let residentB: User;

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
      name: `PL Society ${runId}`,
      address: "1 PL St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `PL-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "PL-101", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "RESIDENT" | "ADMIN", flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  admin = await mkUser("PL Admin", "ADMIN");
  residentA = await mkUser("PL Resident A", "RESIDENT", flat.id);
  residentB = await mkUser("PL Resident B", "RESIDENT", flat.id);
});

afterAll(async () => {
  await prisma.pollVote.deleteMany({ where: { poll: { societyId } } });
  await prisma.pollOption.deleteMany({ where: { poll: { societyId } } });
  await prisma.poll.deleteMany({ where: { societyId } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("create", () => {
  it("rejects a past deadline", async () => {
    await expectTRPCError(
      pollService.createPoll(admin, {
        question: "Late?",
        options: ["A", "B"],
        deadline: new Date(Date.now() - 1000).toISOString(),
      }),
      "BAD_REQUEST",
    );
  });
});

describe("single-vote enforcement", () => {
  let pollId: string;
  let optionIds: string[];

  beforeAll(async () => {
    const poll = await pollService.createPoll(admin, {
      question: "Paint colour for the lobby?",
      options: ["Blue", "Green", "Beige"],
      deadline: future(),
    });
    pollId = poll.id;
    optionIds = poll.options.map((o) => o.id);
  });

  it("a resident votes once", async () => {
    const poll = await pollService.votePoll(residentA, { pollId, optionId: optionIds[0]! });
    expect(poll.totalVotes).toBe(1);
    expect(poll.myOptionIds).toEqual([optionIds[0]]);
  });

  it("the same resident cannot vote again — same or different option", async () => {
    await expectTRPCError(
      pollService.votePoll(residentA, { pollId, optionId: optionIds[0]! }),
      "CONFLICT",
    );
    await expectTRPCError(
      pollService.votePoll(residentA, { pollId, optionId: optionIds[1]! }),
      "CONFLICT",
    );
  });

  it("a different resident can still vote", async () => {
    const poll = await pollService.votePoll(residentB, { pollId, optionId: optionIds[1]! });
    expect(poll.totalVotes).toBe(2);
  });

  it("voting for an option of another poll is NOT_FOUND", async () => {
    const other = await pollService.createPoll(admin, {
      question: "Other poll",
      options: ["X", "Y"],
      deadline: future(),
    });
    await expectTRPCError(
      pollService.votePoll(residentB, { pollId, optionId: other.options[0]!.id }),
      "NOT_FOUND",
    );
  });

  it("results aggregate counts and percentages", async () => {
    const results = await pollService.pollResults(admin, { pollId });
    expect(results.totalVotes).toBe(2);
    const blue = results.options.find((o) => o.id === optionIds[0]);
    expect(blue?.votes).toBe(1);
    expect(blue?.percentage).toBe(50);
    const beige = results.options.find((o) => o.id === optionIds[2]);
    expect(beige?.votes).toBe(0);
    expect(beige?.percentage).toBe(0);
  });
});

describe("multiple-choice polls", () => {
  it("allows different options but never the same option twice", async () => {
    const poll = await pollService.createPoll(admin, {
      question: "Which amenities do you use?",
      options: ["Gym", "Pool", "Clubhouse"],
      allowMultiple: true,
      deadline: future(),
    });
    const [gym, pool] = poll.options.map((o) => o.id);

    await pollService.votePoll(residentA, { pollId: poll.id, optionId: gym! });
    const second = await pollService.votePoll(residentA, { pollId: poll.id, optionId: pool! });
    expect(second.myOptionIds.sort()).toEqual([gym, pool].sort());

    await expectTRPCError(
      pollService.votePoll(residentA, { pollId: poll.id, optionId: gym! }),
      "CONFLICT",
    );
  });
});

describe("deadlines and listing", () => {
  it("voting after the deadline is rejected", async () => {
    const poll = await pollService.createPoll(admin, {
      question: "Closing soon",
      options: ["A", "B"],
      deadline: future(),
    });
    await prisma.poll.update({
      where: { id: poll.id },
      data: { deadline: new Date(Date.now() - 1000) },
    });
    await expectTRPCError(
      pollService.votePoll(residentA, { pollId: poll.id, optionId: poll.options[0]!.id }),
      "CONFLICT",
    );
  });

  it("list filters ACTIVE vs CLOSED and reports my votes", async () => {
    const active = await pollService.listPolls(residentA, { state: "ACTIVE", limit: 50 });
    expect(active.items.every((p) => !p.isClosed)).toBe(true);

    const closed = await pollService.listPolls(residentA, { state: "CLOSED", limit: 50 });
    expect(closed.items.every((p) => p.isClosed)).toBe(true);
    expect(closed.items.length).toBeGreaterThanOrEqual(1);

    const lobby = active.items.find((p) => p.question.includes("lobby"));
    expect(lobby?.myOptionIds).toHaveLength(1);
  });
});
