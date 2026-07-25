import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type FlatType, type User } from "@repo/database";
import ExcelJS from "exceljs";

import * as importService from "./import.service";

const runId = `imp-${Date.now().toString(36)}`;

let societyId: string;
let existingTowerId: string;
let existingFlatId: string;
let admin: User;
/** An admin with no society, for the PRECONDITION_FAILED path. */
let strayAdmin: User;

function email(local: string): string {
  return `${local}-${runId}@test.local`;
}

/** Phones must be globally unique, so namespace them by run too. */
const phoneBase = 9000000000 + (Date.now() % 900000);
function phone(offset: number): string {
  return String(phoneBase + offset);
}

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

function csvBase64(rows: string[][]): string {
  const text = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  return Buffer.from(text, "utf8").toString("base64");
}

function input(
  rows: string[][],
  overrides: Partial<importService.ImportInput> = {},
): importService.ImportInput {
  return {
    fileName: "residents.csv",
    fileBase64: csvBase64(rows),
    createMissingFlats: true,
    defaultFlatType: "TWO_BHK" as FlatType,
    ...overrides,
  };
}

/** The header wording an admin is most likely to actually type. */
const HEADER = ["Name", "Email", "Phone", "Tower", "Flats number"];

function rowFor(row: importService.ImportPreview, rowNumber: number) {
  const found = row.rows.find((r) => r.rowNumber === rowNumber);
  expect(found, `row ${rowNumber} missing from preview`).toBeDefined();
  return found!;
}

function codes(row: importService.ImportRowResult): string[] {
  return row.issues.map((issue) => issue.code);
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `Import Society ${runId}`,
      address: "1 Import St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;

  const tower = await prisma.tower.create({
    data: { societyId, name: `Existing Tower ${runId}` },
  });
  existingTowerId = tower.id;

  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "101", floor: 1, type: "TWO_BHK" },
  });
  existingFlatId = flat.id;

  admin = await prisma.user.create({
    data: {
      name: "Import Admin",
      email: email("import-admin"),
      role: "ADMIN",
      societyId,
      passwordHash: "x",
    },
  });

  strayAdmin = await prisma.user.create({
    data: {
      name: "Stray Admin",
      email: email("stray-admin"),
      role: "ADMIN",
      passwordHash: "x",
    },
  });
});

afterAll(async () => {
  // FK-safe order: profiles → users → flats → towers → society.
  const towers = await prisma.tower.findMany({ where: { societyId }, select: { id: true } });
  const towerIds = towers.map((t) => t.id);
  const flats = await prisma.flat.findMany({
    where: { towerId: { in: towerIds } },
    select: { id: true },
  });
  const flatIds = flats.map((f) => f.id);

  await prisma.residentProfile.deleteMany({ where: { flatId: { in: flatIds } } });
  await prisma.pendingResidentInvite.deleteMany({ where: { societyId } });
  await prisma.user.deleteMany({ where: { societyId } });
  await prisma.user.deleteMany({ where: { id: strayAdmin.id } });
  await prisma.flat.deleteMany({ where: { id: { in: flatIds } } });
  await prisma.tower.deleteMany({ where: { id: { in: towerIds } } });
  await prisma.society.delete({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("previewResidentImport — file and header handling", () => {
  it("rejects an admin with no society", async () => {
    await expectTRPCError(
      importService.previewResidentImport(
        strayAdmin,
        input([HEADER, ["A", email("a"), phone(1), "T", "1"]]),
      ),
      "PRECONDITION_FAILED",
    );
  });

  it("rejects a sheet missing a required column", async () => {
    await expectTRPCError(
      importService.previewResidentImport(
        admin,
        input([
          ["Name", "Email", "Phone"],
          ["A", email("a"), phone(1)],
        ]),
      ),
      "BAD_REQUEST",
    );
  });

  it("rejects a sheet with headers but no data rows", async () => {
    await expectTRPCError(
      importService.previewResidentImport(admin, input([HEADER])),
      "BAD_REQUEST",
    );
  });

  it("rejects an unsupported file extension", async () => {
    await expectTRPCError(
      importService.previewResidentImport(
        admin,
        input([HEADER, ["A", email("a"), phone(1), "T", "1"]], { fileName: "register.xls" }),
      ),
      "BAD_REQUEST",
    );
  });

  it("rejects an empty file", async () => {
    await expectTRPCError(
      importService.previewResidentImport(admin, input([], { fileBase64: "" })),
      "BAD_REQUEST",
    );
  });

  it("matches header synonyms and ignores surrounding whitespace", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([
        ["  full name ", "E-Mail", "Mobile No.", "Block", "Unit Number"],
        [" Asha  Rao ", ` ${email("asha")} `, ` ${phone(2)} `, ` Tower Z ${runId} `, " 402 "],
      ]),
    );

    expect(preview.totalRows).toBe(1);
    expect(preview.readyCount).toBe(1);
    const row = rowFor(preview, 2);
    expect(row.name).toBe("Asha Rao");
    expect(row.email).toBe(email("asha"));
    expect(row.towerName).toBe(`Tower Z ${runId}`);
    expect(row.flatNumber).toBe("402");
  });

  it("reads an .xlsx workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Residents");
    sheet.addRow(HEADER);
    // A numeric phone cell — how Excel stores an unformatted phone column.
    sheet.addRow(["Bhavna Iyer", email("bhavna"), Number(phone(3)), `Tower X ${runId}`, "902"]);
    const buffer = await workbook.xlsx.writeBuffer();

    const preview = await importService.previewResidentImport(admin, {
      fileName: "register.xlsx",
      fileBase64: Buffer.from(buffer).toString("base64"),
      createMissingFlats: true,
      defaultFlatType: "TWO_BHK",
    });

    expect(preview.readyCount).toBe(1);
    const row = rowFor(preview, 2);
    expect(row.name).toBe("Bhavna Iyer");
    expect(row.phone).toBe(phone(3));
  });
});

describe("previewResidentImport — row validation", () => {
  it("normalises phone numbers written the way registers write them", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([
        HEADER,
        ["A", email("p1"), `+91 ${phone(10).slice(0, 5)} ${phone(10).slice(5)}`, "T1", "101"],
        ["B", email("p2"), `0${phone(11)}`, "T1", "102"],
        ["C", email("p3"), `${phone(12).slice(0, 5)}-${phone(12).slice(5)}`, "T1", "103"],
      ]),
    );

    expect(rowFor(preview, 2).phone).toBe(phone(10));
    expect(rowFor(preview, 3).phone).toBe(phone(11));
    expect(rowFor(preview, 4).phone).toBe(phone(12));
    expect(preview.errorCount).toBe(0);
  });

  it("flags bad emails, short phones, and rows with no contact at all", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([
        HEADER,
        ["A", "not-an-email", phone(20), "T1", "201"],
        ["B", email("b"), "12345", "T1", "202"],
        ["C", "", "", "T1", "203"],
        ["", email("d"), phone(21), "T1", "204"],
      ]),
    );

    expect(codes(rowFor(preview, 2))).toContain("EMAIL_INVALID");
    expect(codes(rowFor(preview, 3))).toContain("PHONE_INVALID");
    expect(codes(rowFor(preview, 4))).toContain("CONTACT_REQUIRED");
    expect(codes(rowFor(preview, 5))).toContain("NAME_REQUIRED");
    expect(preview.errorCount).toBe(4);
    expect(preview.readyCount).toBe(0);
  });

  it("fails the second row when an email or phone repeats inside the file", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([
        HEADER,
        ["A", email("dupe"), phone(30), "T1", "301"],
        ["B", email("dupe"), phone(31), "T1", "302"],
        ["C", email("c-uniq"), phone(30), "T1", "303"],
      ]),
    );

    expect(rowFor(preview, 2).status).toBe("READY");
    expect(codes(rowFor(preview, 3))).toContain("DUPLICATE_EMAIL_IN_FILE");
    expect(codes(rowFor(preview, 4))).toContain("DUPLICATE_PHONE_IN_FILE");
    expect(preview.readyCount).toBe(1);
  });

  it("warns, but does not fail, when a resident has no email", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([HEADER, ["Phone Only", "", phone(40), "T1", "401"]]),
    );

    const row = rowFor(preview, 2);
    expect(row.status).toBe("READY");
    expect(codes(row)).toContain("NO_EMAIL");
    expect(preview.noLoginCount).toBe(1);
  });

  it("errors on an unknown flat when createMissingFlats is off", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([HEADER, ["A", email("nf"), phone(50), `Nowhere ${runId}`, "999"]], {
        createMissingFlats: false,
      }),
    );

    expect(codes(rowFor(preview, 2))).toContain("FLAT_NOT_FOUND");
    expect(preview.readyCount).toBe(0);
  });

  it("matches an existing flat case- and spacing-insensitively", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([HEADER, ["A", email("ex"), phone(51), ` existing   tower ${runId} `, "101"]], {
        createMissingFlats: false,
      }),
    );

    expect(rowFor(preview, 2).status).toBe("READY");
    expect(preview.flatsToCreate).toBe(0);
    expect(preview.towersToCreate).toHaveLength(0);
  });

  /**
   * A flat takes one resident. The second row aiming at the same flat is
   * rejected rather than added as a flatmate — including when both rows are in
   * the same sheet, where nothing is in the database to compare against yet.
   */
  it("counts a new tower once and refuses a second resident for the same flat", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([
        HEADER,
        ["A", email("s1"), phone(60), `Shared ${runId}`, "501"],
        ["B", email("s2"), phone(61), `Shared ${runId}`, "501"],
        ["C", email("s3"), phone(62), `shared ${runId}`, "502"],
      ]),
    );

    expect(preview.readyCount).toBe(2);
    expect(codes(rowFor(preview, 3))).toContain("FLAT_OCCUPIED");
    // The tower is still counted once across both of its flats, and the
    // rejected row adds no flat of its own.
    expect(preview.towersToCreate).toEqual([`Shared ${runId}`]);
    expect(preview.flatsToCreate).toBe(2);
  });

  it("errors when the email already belongs to a real account", async () => {
    const preview = await importService.previewResidentImport(
      admin,
      input([HEADER, ["Clash", admin.email!, phone(70), "T1", "701"]]),
    );

    expect(codes(rowFor(preview, 2))).toContain("ACCOUNT_EXISTS");
    expect(preview.errorCount).toBe(1);
  });
});

describe("commitResidentImport", () => {
  it("refuses a sheet with nothing importable", async () => {
    await expectTRPCError(
      importService.commitResidentImport(
        admin,
        input([HEADER, ["A", "bad-email", "nope", "T1", "801"]]),
      ),
      "BAD_REQUEST",
    );
  });

  it("creates towers, flats, users and resident profiles, then skips a re-run", async () => {
    const towerName = `Commit Tower ${runId}`;
    const sheet = input([
      HEADER,
      ["Ravi Kumar", email("ravi"), phone(80), towerName, "A-304"],
      ["Sita Kumar", email("sita"), phone(81), towerName, "A-304"],
      ["Old Flat", email("oldflat"), phone(82), `Existing Tower ${runId}`, "101"],
    ]);

    const result = await importService.commitResidentImport(admin, sheet);

    // Sita is refused: Ravi took A-304 earlier in the same sheet.
    expect(result.importedCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.towersCreated).toBe(1);
    expect(result.flatsCreated).toBe(1);

    const ravi = await prisma.user.findUnique({
      where: { email: email("ravi") },
      include: { residentProfile: { include: { flat: { include: { tower: true } } } } },
    });
    expect(ravi).not.toBeNull();
    expect(ravi!.role).toBe("RESIDENT");
    expect(ravi!.societyId).toBe(societyId);
    expect(ravi!.phone).toBe(phone(80));
    // No credential of any kind — the row cannot be logged into until claimed.
    expect(ravi!.passwordHash).toBeNull();
    expect(ravi!.googleId).toBeNull();
    expect(ravi!.importedAt).not.toBeNull();
    expect(ravi!.isActive).toBe(true);
    expect(ravi!.residentProfile!.flat.flatNumber).toBe("A-304");
    expect(ravi!.residentProfile!.flat.tower.name).toBe(towerName);
    // Floor derived from "A-304" with no Floor column present.
    expect(ravi!.residentProfile!.flat.floor).toBe(3);
    expect(ravi!.residentProfile!.flat.type).toBe("TWO_BHK");

    // The resident of a brand-new flat owns it, and the row that tried to join
    // that flat created no account at all.
    expect(ravi!.residentProfile!.isPrimaryResident).toBe(true);
    expect(await prisma.user.findUnique({ where: { email: email("sita") } })).toBeNull();

    // The pre-existing flat already had no residents, so this one is primary,
    // and no duplicate flat was created for it.
    const oldFlat = await prisma.user.findUnique({
      where: { email: email("oldflat") },
      include: { residentProfile: true },
    });
    expect(oldFlat!.residentProfile!.flatId).toBe(existingFlatId);

    // Re-running the identical file imports nothing rather than duplicating:
    // the two that landed are skipped, and Sita's row fails on the flat Ravi
    // now owns for real.
    await expectTRPCError(importService.commitResidentImport(admin, sheet), "BAD_REQUEST");
    const preview = await importService.previewResidentImport(admin, sheet);
    expect(preview.skippedCount).toBe(2);
    expect(preview.errorCount).toBe(1);
    expect(preview.readyCount).toBe(0);
    expect(codes(rowFor(preview, 2))).toContain("ALREADY_IMPORTED");
    expect(codes(rowFor(preview, 3))).toContain("FLAT_OCCUPIED");

    expect(await prisma.user.count({ where: { email: email("ravi") } })).toBe(1);
  });

  it("honours an explicit Floor and Flat Type column", async () => {
    const result = await importService.commitResidentImport(
      admin,
      input([
        [...HEADER, "Floor", "Flat Type"],
        ["Meena Das", email("meena"), phone(90), `Typed ${runId}`, "77", "12", "3BHK"],
      ]),
    );
    expect(result.importedCount).toBe(1);

    const meena = await prisma.user.findUnique({
      where: { email: email("meena") },
      include: { residentProfile: { include: { flat: true } } },
    });
    expect(meena!.residentProfile!.flat.floor).toBe(12);
    expect(meena!.residentProfile!.flat.type).toBe("THREE_BHK");
  });

  it("closes out a pending invite that the import has superseded", async () => {
    const invitedEmail = email("invited");
    // Its own empty flat: the shared fixture flat has an owner by now, and an
    // occupied flat would reject the row before the invite could be claimed.
    const freeFlat = await prisma.flat.create({
      data: { towerId: existingTowerId, flatNumber: "909", floor: 9, type: "TWO_BHK" },
    });
    const invite = await prisma.pendingResidentInvite.create({
      data: {
        societyId,
        flatId: freeFlat.id,
        email: invitedEmail,
        invitedByAdminId: admin.id,
      },
    });

    await importService.commitResidentImport(
      admin,
      input([HEADER, ["Invited Person", invitedEmail, phone(95), `Existing Tower ${runId}`, "909"]]),
    );

    const after = await prisma.pendingResidentInvite.findUnique({ where: { id: invite.id } });
    expect(after!.status).toBe("CLAIMED");
    expect(after!.claimedAt).not.toBeNull();
  });

  it("imports the good rows and passes over the broken ones", async () => {
    const result = await importService.commitResidentImport(
      admin,
      input([
        HEADER,
        ["Good One", email("good1"), phone(100), `Partial ${runId}`, "11"],
        ["Bad One", "still-not-an-email", "", `Partial ${runId}`, "12"],
        ["Good Two", email("good2"), phone(101), `Partial ${runId}`, "13"],
      ]),
    );

    expect(result.importedCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(await prisma.user.findUnique({ where: { email: email("good1") } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: email("good2") } })).not.toBeNull();
  });
});
