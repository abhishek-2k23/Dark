import { TRPCError } from "@trpc/server";
import { prisma, type FlatType, type User } from "@repo/database";
import { logger } from "@repo/logger";
import ExcelJS from "exceljs";

/**
 * Bulk resident import — the migration path off a paper register or another
 * society app. An admin uploads one spreadsheet (Name, Email, Phone, Tower,
 * Flat Number) and every valid row becomes a real `User` + `ResidentProfile`,
 * so the whole register shows up in the resident list and directory at once
 * instead of being typed in one invite at a time.
 *
 * Two passes, both driven by the same file:
 *
 *   preview → parse + validate + resolve, write nothing, report every row
 *   commit  → re-parse the same file and write the rows that came back READY
 *
 * Commit deliberately re-does the analysis rather than trusting a preview the
 * client hands back: the file is the only input, so there is no server-side
 * session to expire and nothing a caller can tamper with between the steps.
 *
 * Imported accounts carry no credential at all — no password, no Google id —
 * and are stamped with `importedAt`. They cannot be logged into. The first
 * signup or Google sign-in on a matching email *claims* the row, setting the
 * credential and clearing the stamp (see `auth.service.ts`).
 */

/** Rows per file. A register larger than this should be split. */
export const IMPORT_MAX_ROWS = 1000;

/** Decoded upload size. Comfortably more than IMPORT_MAX_ROWS of text needs. */
export const IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/**
 * READY  — will be created on commit.
 * SKIPPED— already in the system; commit leaves it alone (re-running the same
 *          file is therefore safe).
 * ERROR  — cannot be created; commit passes over it.
 */
export type ImportRowStatus = "READY" | "SKIPPED" | "ERROR";

export interface ImportRowIssue {
  /** Stable code so clients can translate; `message` is the English fallback. */
  code: string;
  message: string;
}

export interface ImportRowResult {
  /** 1-based row number in the sheet, header included — matches what Excel shows. */
  rowNumber: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  towerName: string | null;
  flatNumber: string | null;
  status: ImportRowStatus;
  issues: ImportRowIssue[];
}

export interface ImportPreview {
  totalRows: number;
  readyCount: number;
  skippedCount: number;
  errorCount: number;
  /** Towers that do not exist yet and would be created. */
  towersToCreate: string[];
  /** How many flats would be created. */
  flatsToCreate: number;
  /** READY rows with no email — they import, but cannot sign in yet. */
  noLoginCount: number;
  rows: ImportRowResult[];
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  towersCreated: number;
  flatsCreated: number;
}

export interface ImportInput {
  /** Original filename — the extension picks the parser. */
  fileName: string;
  /** Base64 of the raw file bytes. */
  fileBase64: string;
  /** Create towers/flats named in the sheet that don't exist yet. */
  createMissingFlats: boolean;
  /** Flat type for auto-created flats when the sheet doesn't say. */
  defaultFlatType: FlatType;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

type ColumnKey = "name" | "email" | "phone" | "tower" | "flatNumber" | "floor" | "flatType";

/** Lowercase, strip everything but letters and digits: "Flat No." -> "flatno". */
function canon(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Header synonyms, canonicalised. Registers exported from other apps and
 * hand-kept spreadsheets label these columns a dozen different ways, and
 * making an admin rename headers before importing defeats the point.
 */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  name: ["name", "fullname", "residentname", "membername", "resident", "owner", "ownername"],
  email: ["email", "emailaddress", "emailid", "mail", "mailid"],
  phone: [
    "phone",
    "phonenumber",
    "phoneno",
    "mobile",
    "mobilenumber",
    "mobileno",
    "contact",
    "contactnumber",
    "contactno",
    "whatsapp",
  ],
  tower: ["tower", "towername", "block", "blockname", "building", "buildingname", "wing"],
  flatNumber: [
    "flat",
    "flatnumber",
    "flatsnumber",
    "flatno",
    "flatsno",
    "flatnum",
    "unit",
    "unitnumber",
    "unitno",
    "house",
    "houseno",
    "housenumber",
    "door",
    "doorno",
    "doornumber",
    "apartment",
    "apartmentnumber",
  ],
  floor: ["floor", "floornumber", "floorno", "level"],
  flatType: ["flattype", "type", "unittype", "configuration", "config", "bhk"],
};

const REQUIRED_COLUMNS: ColumnKey[] = ["name", "tower", "flatNumber"];

/** Human labels for the "missing column" error and the downloadable template. */
export const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  tower: "Tower",
  flatNumber: "Flat Number",
  floor: "Floor",
  flatType: "Flat Type",
};

const FLAT_TYPE_ALIASES: Record<string, FlatType> = {
  "1rk": "ONE_RK",
  onerk: "ONE_RK",
  rk: "ONE_RK",
  studio: "ONE_RK",
  "1bhk": "ONE_BHK",
  onebhk: "ONE_BHK",
  "1": "ONE_BHK",
  "2bhk": "TWO_BHK",
  twobhk: "TWO_BHK",
  "2": "TWO_BHK",
  "3bhk": "THREE_BHK",
  threebhk: "THREE_BHK",
  "3": "THREE_BHK",
  "4bhk": "FOUR_BHK",
  fourbhk: "FOUR_BHK",
  "4": "FOUR_BHK",
  other: "OTHER",
};

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

interface RawRow {
  /** Row number as the spreadsheet shows it, so errors point somewhere real. */
  rowNumber: number;
  cells: string[];
}

/**
 * Flatten one ExcelJS cell to text. Cell values are a union — plain scalars,
 * rich text, hyperlinks, formulas with a cached result — and a register that
 * has been edited by hand for years contains all of them.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink.replace(/^mailto:/i, "").trim();
    }
  }
  return String(value).trim();
}

/** RFC 4180-ish CSV: quoted fields, escaped quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decodeUpload(input: ImportInput): Buffer {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.fileBase64, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file could not be decoded" });
  }
  if (buffer.byteLength === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file is empty" });
  }
  if (buffer.byteLength > IMPORT_MAX_FILE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The file is larger than ${Math.floor(IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB`,
    });
  }
  return buffer;
}

async function readRows(input: ImportInput): Promise<RawRow[]> {
  const buffer = decodeUpload(input);
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";

  if (extension === "csv" || extension === "txt") {
    // Strip a UTF-8 BOM — Excel writes one on every "Save as CSV", and it would
    // otherwise glue itself to the first header and break the column match.
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    return parseCsv(text).map((cells, index) => ({ rowNumber: index + 1, cells }));
  }

  if (extension !== "xlsx") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Upload a .xlsx or .csv file. The older .xls format is not supported — open it in " +
        "Excel or Google Sheets and save it as .xlsx.",
    });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs declares its own Buffer type (from an older @types/node), which
    // no longer lines up with the generic Buffer<ArrayBufferLike> we hold.
    // Identical bytes either way — the cast is purely to bridge the typings.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That file could not be read as a spreadsheet — is it really a .xlsx?",
    });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The workbook has no sheets" });
  }

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellText(cell.value);
    });
    // eachCell leaves holes for never-populated columns.
    rows.push({ rowNumber: row.number, cells: Array.from(cells, (cell) => cell ?? "") });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Field normalisation
// ---------------------------------------------------------------------------

/** Trim and collapse internal runs of whitespace. */
function tidy(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Indian mobile numbers, tolerant of how registers actually store them:
 * "+91 98765 43210", "098765-43210", "9876543210", or an Excel numeric cell.
 * Anything that isn't a plain 10-digit number after stripping is rejected
 * rather than guessed at.
 */
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * Floor from the flat number when the sheet has no Floor column: the trailing
 * numeric group minus its last two digits ("A-304" -> 3, "1204" -> 12), or its
 * first digit for two-digit numbers ("45" -> 4). Single digits and unnumbered
 * flats land on the ground floor. A guess, but a conventional one, and the
 * admin can add a Floor column whenever the building doesn't follow it.
 */
function deriveFloor(flatNumber: string): number {
  const match = flatNumber.match(/(\d+)\s*$/);
  if (!match?.[1]) return 0;
  const digits = Number(match[1]);
  if (!Number.isFinite(digits)) return 0;
  if (digits >= 100) return Math.floor(digits / 100);
  if (digits >= 10) return Math.floor(digits / 10);
  return 0;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

interface AnalysedRow extends ImportRowResult {
  /** Present on READY rows: everything commit needs, already validated. */
  ready: {
    name: string;
    email: string | null;
    phone: string | null;
    towerName: string;
    flatNumber: string;
    floor: number;
    flatType: FlatType;
    towerKey: string;
    flatKey: string;
    isPrimaryResident: boolean;
  } | null;
}

interface Analysis {
  preview: ImportPreview;
  rows: AnalysedRow[];
  /** Tower names to create, keyed by canonical name -> display name. */
  towersToCreate: Map<string, string>;
  /** Flats to create, keyed by flatKey. */
  flatsToCreate: Map<
    string,
    { towerKey: string; flatNumber: string; floor: number; type: FlatType }
  >;
  /** Existing flat ids by flatKey. */
  existingFlatIds: Map<string, string>;
  /** Existing tower ids by towerKey. */
  existingTowerIds: Map<string, string>;
}

function issue(code: string, message: string): ImportRowIssue {
  return { code, message };
}

/** tower + flat identity, case- and spacing-insensitive on both parts. */
function makeFlatKey(towerKey: string, flatNumber: string): string {
  return `${towerKey} ${canon(flatNumber)}`;
}

async function analyse(actor: User, input: ImportInput): Promise<Analysis> {
  const societyId = actorSocietyId(actor);
  const rawRows = await readRows(input);

  // --- header ------------------------------------------------------------
  const headerRow = rawRows.find((row) => row.cells.some((cell) => tidy(cell).length > 0));
  if (!headerRow) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The sheet is empty" });
  }

  const columnIndex = {} as Record<ColumnKey, number | undefined>;
  headerRow.cells.forEach((cell, index) => {
    const key = canon(cell);
    if (!key) return;
    for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, string[]][]) {
      // First header wins, so a stray duplicate column doesn't shadow the real one.
      if (columnIndex[column] === undefined && aliases.includes(key)) {
        columnIndex[column] = index;
        return;
      }
    }
  });

  const missing = REQUIRED_COLUMNS.filter((column) => columnIndex[column] === undefined);
  if (missing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        `The sheet is missing required column(s): ${missing.map((c) => COLUMN_LABELS[c]).join(", ")}. ` +
        `Expected headers: ${REQUIRED_COLUMNS.concat(["email", "phone"]).map((c) => COLUMN_LABELS[c]).join(", ")}.`,
    });
  }

  const dataRows = rawRows
    .filter((row) => row.rowNumber !== headerRow.rowNumber)
    .filter((row) => row.cells.some((cell) => tidy(cell).length > 0));

  if (dataRows.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The sheet has headers but no resident rows",
    });
  }
  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The sheet has ${dataRows.length} rows; the limit is ${IMPORT_MAX_ROWS} per import. Split it into smaller files.`,
    });
  }

  const at = (row: RawRow, column: ColumnKey): string => {
    const index = columnIndex[column];
    return index === undefined ? "" : tidy(row.cells[index]);
  };

  // --- pass 1: per-row field validation ----------------------------------
  interface Parsed {
    rowNumber: number;
    name: string;
    email: string | null;
    phone: string | null;
    towerName: string;
    flatNumber: string;
    floor: number;
    flatType: FlatType | null;
    issues: ImportRowIssue[];
  }

  const parsed: Parsed[] = dataRows.map((row) => {
    const issues: ImportRowIssue[] = [];

    const name = at(row, "name");
    if (!name) issues.push(issue("NAME_REQUIRED", "Name is required"));

    const rawEmail = at(row, "email");
    let email: string | null = null;
    if (rawEmail) {
      const candidate = rawEmail.toLowerCase().replace(/\s+/g, "");
      if (EMAIL_PATTERN.test(candidate)) email = candidate;
      else issues.push(issue("EMAIL_INVALID", `"${rawEmail}" is not a valid email address`));
    }

    const rawPhone = at(row, "phone");
    let phone: string | null = null;
    if (rawPhone) {
      phone = normalizePhone(rawPhone);
      if (!phone) {
        issues.push(issue("PHONE_INVALID", `"${rawPhone}" is not a 10-digit phone number`));
      }
    }

    if (!rawEmail && !rawPhone) {
      issues.push(issue("CONTACT_REQUIRED", "Provide an email or a phone number"));
    }

    const towerName = at(row, "tower");
    if (!towerName) issues.push(issue("TOWER_REQUIRED", "Tower is required"));

    const flatNumber = at(row, "flatNumber");
    if (!flatNumber) issues.push(issue("FLAT_REQUIRED", "Flat number is required"));

    const rawFloor = at(row, "floor");
    let floor = deriveFloor(flatNumber);
    if (rawFloor) {
      const parsedFloor = Number(rawFloor.replace(/[^\d-]/g, ""));
      if (Number.isInteger(parsedFloor)) floor = parsedFloor;
      else issues.push(issue("FLOOR_INVALID", `"${rawFloor}" is not a floor number`));
    }

    const rawType = at(row, "flatType");
    let flatType: FlatType | null = null;
    if (rawType) {
      flatType = FLAT_TYPE_ALIASES[canon(rawType)] ?? null;
      if (!flatType) {
        issues.push(issue("FLAT_TYPE_INVALID", `"${rawType}" is not a known flat type`));
      }
    }

    return {
      rowNumber: row.rowNumber,
      name,
      email,
      phone,
      towerName,
      flatNumber,
      floor,
      flatType,
      issues,
    };
  });

  // --- bulk lookups ------------------------------------------------------
  const emails = [...new Set(parsed.map((r) => r.email).filter((e): e is string => !!e))];
  const phones = [...new Set(parsed.map((r) => r.phone).filter((p): p is string => !!p))];

  const existingUsers =
    emails.length + phones.length === 0
      ? []
      : await prisma.user.findMany({
          where: { OR: [{ email: { in: emails } }, { phone: { in: phones } }] },
          select: { id: true, email: true, phone: true, societyId: true, importedAt: true },
        });

  const userByEmail = new Map(
    existingUsers.filter((u) => u.email).map((u) => [u.email!, u] as const),
  );
  const userByPhone = new Map(
    existingUsers.filter((u) => u.phone).map((u) => [u.phone!, u] as const),
  );

  const existingTowers = await prisma.tower.findMany({
    where: { societyId },
    select: { id: true, name: true },
  });
  const existingTowerIds = new Map(existingTowers.map((t) => [canon(t.name), t.id] as const));

  const existingFlats = await prisma.flat.findMany({
    where: { tower: { societyId } },
    select: {
      id: true,
      flatNumber: true,
      tower: { select: { name: true } },
      _count: { select: { residents: true } },
      // Existence check, not a list: one row is enough to know it is taken.
      residents: { where: { isPrimaryResident: true }, select: { id: true }, take: 1 },
    },
  });
  const existingFlatIds = new Map<string, string>();
  const residentCountByFlatKey = new Map<string, number>();
  /** Flats that already have an owner, so no sheet row may be allotted one. */
  const occupiedFlatKeys = new Set<string>();
  for (const flat of existingFlats) {
    const key = makeFlatKey(canon(flat.tower.name), flat.flatNumber);
    existingFlatIds.set(key, flat.id);
    residentCountByFlatKey.set(key, flat._count.residents);
    if (flat.residents.length > 0) occupiedFlatKeys.add(key);
  }

  // --- pass 2: cross-row and cross-table resolution ----------------------
  const towersToCreate = new Map<string, string>();
  const flatsToCreate = new Map<
    string,
    { towerKey: string; flatNumber: string; floor: number; type: FlatType }
  >();
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();

  const rows: AnalysedRow[] = parsed.map((row) => {
    const issues = [...row.issues];
    let status: ImportRowStatus = issues.length > 0 ? "ERROR" : "READY";

    // Duplicates inside the sheet: the first occurrence wins, later ones fail
    // so the admin can see exactly which line to fix.
    if (status === "READY" && row.email) {
      const first = seenEmail.get(row.email);
      if (first !== undefined) {
        issues.push(issue("DUPLICATE_EMAIL_IN_FILE", `Email repeats row ${first}`));
        status = "ERROR";
      }
    }
    if (status === "READY" && row.phone) {
      const first = seenPhone.get(row.phone);
      if (first !== undefined) {
        issues.push(issue("DUPLICATE_PHONE_IN_FILE", `Phone repeats row ${first}`));
        status = "ERROR";
      }
    }

    // Already in the system. A never-claimed import of ours is a re-run of the
    // same file, which is fine and skipped; anything else is a real account and
    // must not be silently touched.
    if (status === "READY") {
      const clash =
        (row.email ? userByEmail.get(row.email) : undefined) ??
        (row.phone ? userByPhone.get(row.phone) : undefined);
      if (clash) {
        if (clash.importedAt && clash.societyId === societyId) {
          issues.push(issue("ALREADY_IMPORTED", "Already imported — skipping"));
          status = "SKIPPED";
        } else {
          issues.push(
            issue("ACCOUNT_EXISTS", "An account already exists with this email or phone"),
          );
          status = "ERROR";
        }
      }
    }

    // Tower / flat resolution.
    let towerKey = "";
    let flatKey = "";
    if (status === "READY") {
      towerKey = canon(row.towerName);
      flatKey = makeFlatKey(towerKey, row.flatNumber);
      const flatExists = existingFlatIds.has(flatKey) || flatsToCreate.has(flatKey);

      // A flat that already has an owner is not available, whether it was taken
      // before this file or by an earlier row in it. Flagged as an error rather
      // than skipped so the admin sees a line to fix — a sheet allotting an
      // occupied flat is usually a stale register, not a duplicate run.
      if (occupiedFlatKeys.has(flatKey)) {
        issues.push(
          issue(
            "FLAT_OCCUPIED",
            `Flat ${row.flatNumber} in tower ${row.towerName} already has a resident`,
          ),
        );
        status = "ERROR";
      } else if (!flatExists) {
        if (!input.createMissingFlats) {
          issues.push(
            issue(
              "FLAT_NOT_FOUND",
              `Flat ${row.flatNumber} in tower ${row.towerName} does not exist`,
            ),
          );
          status = "ERROR";
        } else {
          if (!existingTowerIds.has(towerKey) && !towersToCreate.has(towerKey)) {
            towersToCreate.set(towerKey, row.towerName);
          }
          flatsToCreate.set(flatKey, {
            towerKey,
            flatNumber: row.flatNumber,
            floor: row.floor,
            type: row.flatType ?? input.defaultFlatType,
          });
        }
      }
    }

    // Warnings that don't block the import.
    let isPrimaryResident = false;
    if (status === "READY") {
      if (!row.email) {
        issues.push(
          issue(
            "NO_EMAIL",
            "No email — this resident is added to the register but cannot sign in until an email is set",
          ),
        );
      }
      // A row only gets this far if its flat was free, so this resident owns it
      // — and the flat is now taken for every later row in the same sheet.
      isPrimaryResident = true;
      occupiedFlatKeys.add(flatKey);
      residentCountByFlatKey.set(flatKey, (residentCountByFlatKey.get(flatKey) ?? 0) + 1);

      if (row.email) seenEmail.set(row.email, row.rowNumber);
      if (row.phone) seenPhone.set(row.phone, row.rowNumber);
    }

    return {
      rowNumber: row.rowNumber,
      name: row.name || null,
      email: row.email,
      phone: row.phone,
      towerName: row.towerName || null,
      flatNumber: row.flatNumber || null,
      status,
      issues,
      ready:
        status === "READY"
          ? {
              name: row.name,
              email: row.email,
              phone: row.phone,
              towerName: row.towerName,
              flatNumber: row.flatNumber,
              floor: row.floor,
              flatType: row.flatType ?? input.defaultFlatType,
              towerKey,
              flatKey,
              isPrimaryResident,
            }
          : null,
    };
  });

  const readyRows = rows.filter((row) => row.status === "READY");
  const preview: ImportPreview = {
    totalRows: rows.length,
    readyCount: readyRows.length,
    skippedCount: rows.filter((row) => row.status === "SKIPPED").length,
    errorCount: rows.filter((row) => row.status === "ERROR").length,
    towersToCreate: [...towersToCreate.values()],
    flatsToCreate: flatsToCreate.size,
    noLoginCount: readyRows.filter((row) => !row.email).length,
    rows,
  };

  return { preview, rows, towersToCreate, flatsToCreate, existingFlatIds, existingTowerIds };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dry run: parse and validate the sheet against the society's current towers,
 * flats and accounts, and report every row. Writes nothing.
 */
export async function previewResidentImport(
  actor: User,
  input: ImportInput,
): Promise<ImportPreview> {
  const { preview } = await analyse(actor, input);
  return preview;
}

/**
 * Import the READY rows from the sheet. SKIPPED and ERROR rows are passed over
 * — the preview has already shown the admin exactly which, and holding back a
 * 900-row register because two lines have a typo helps nobody.
 *
 * Everything runs in one transaction, so a failure part-way leaves no
 * half-migrated society behind.
 */
export async function commitResidentImport(
  actor: User,
  input: ImportInput,
): Promise<ImportResult> {
  const societyId = actorSocietyId(actor);
  const analysis = await analyse(actor, input);
  const readyRows = analysis.rows
    .map((row) => row.ready)
    .filter((row): row is NonNullable<AnalysedRow["ready"]> => row !== null);

  if (readyRows.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No rows in this sheet can be imported — fix the errors listed and try again",
    });
  }

  // One timestamp for the whole batch: it stamps every row as an unclaimed
  // import *and* acts as the batch marker for reading back the ids that
  // createMany doesn't return.
  const batchStamp = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      // --- towers ---------------------------------------------------------
      const towerIds = new Map(analysis.existingTowerIds);
      if (analysis.towersToCreate.size > 0) {
        await tx.tower.createMany({
          data: [...analysis.towersToCreate.values()].map((name) => ({ societyId, name })),
          skipDuplicates: true,
        });
        const refreshed = await tx.tower.findMany({
          where: { societyId },
          select: { id: true, name: true },
        });
        for (const tower of refreshed) towerIds.set(canon(tower.name), tower.id);
      }

      // --- flats ----------------------------------------------------------
      const flatIds = new Map(analysis.existingFlatIds);
      if (analysis.flatsToCreate.size > 0) {
        const data = [...analysis.flatsToCreate.values()].map((flat) => {
          const towerId = towerIds.get(flat.towerKey);
          if (!towerId) {
            // Unreachable: every flatsToCreate tower was either found or queued.
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Tower for flat ${flat.flatNumber} could not be resolved`,
            });
          }
          return {
            towerId,
            flatNumber: flat.flatNumber,
            floor: flat.floor,
            type: flat.type,
          };
        });
        await tx.flat.createMany({ data, skipDuplicates: true });

        const refreshed = await tx.flat.findMany({
          where: { tower: { societyId } },
          select: { id: true, flatNumber: true, tower: { select: { name: true } } },
        });
        for (const flat of refreshed) {
          flatIds.set(makeFlatKey(canon(flat.tower.name), flat.flatNumber), flat.id);
        }
      }

      // --- users ----------------------------------------------------------
      await tx.user.createMany({
        data: readyRows.map((row) => ({
          name: row.name,
          email: row.email,
          phone: row.phone,
          role: "RESIDENT" as const,
          societyId,
          importedAt: batchStamp,
        })),
      });

      // createMany doesn't return ids; the batch stamp reads them back in one query.
      const created = await tx.user.findMany({
        where: { societyId, importedAt: batchStamp },
        select: { id: true, email: true, phone: true },
      });
      const idByEmail = new Map(created.filter((u) => u.email).map((u) => [u.email!, u.id]));
      const idByPhone = new Map(created.filter((u) => u.phone).map((u) => [u.phone!, u.id]));

      await tx.residentProfile.createMany({
        data: readyRows.map((row) => {
          const userId =
            (row.email ? idByEmail.get(row.email) : undefined) ??
            (row.phone ? idByPhone.get(row.phone) : undefined);
          const flatId = flatIds.get(row.flatKey);
          if (!userId || !flatId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Could not link ${row.name} to flat ${row.flatNumber}`,
            });
          }
          return { userId, flatId, isPrimaryResident: row.isPrimaryResident };
        }),
      });

      // A pending invite for someone who now has an account can never be
      // claimed — signup would find the user row first. Close it out so it
      // doesn't linger in the society's invite list forever.
      const invitedEmails = readyRows.map((row) => row.email).filter((e): e is string => !!e);
      const invitedPhones = readyRows.map((row) => row.phone).filter((p): p is string => !!p);
      if (invitedEmails.length > 0 || invitedPhones.length > 0) {
        await tx.pendingResidentInvite.updateMany({
          where: {
            societyId,
            status: "PENDING",
            OR: [{ email: { in: invitedEmails } }, { phone: { in: invitedPhones } }],
          },
          data: { status: "CLAIMED", claimedAt: batchStamp },
        });
      }

      return {
        towersCreated: analysis.towersToCreate.size,
        flatsCreated: analysis.flatsToCreate.size,
      };
    },
    // A thousand rows is a few thousand inserts; the 5s default is not enough.
    { timeout: 120_000, maxWait: 15_000 },
  );

  logger.info("Bulk resident import committed", {
    societyId,
    adminId: actor.id,
    imported: readyRows.length,
    skipped: analysis.preview.skippedCount,
    errors: analysis.preview.errorCount,
    ...result,
  });

  return {
    importedCount: readyRows.length,
    skippedCount: analysis.preview.skippedCount,
    errorCount: analysis.preview.errorCount,
    ...result,
  };
}
