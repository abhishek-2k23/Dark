import type { ServerRouter } from "@repo/trpc/server";
import type { inferRouterOutputs } from "@trpc/server";

import { formatDate, formatDateTime, formatMoney } from "@/utils/format";
import {
  csvDocument,
  csvRow,
  escapeHtml,
  type ExportFile,
  CSV_MIME,
  CSV_UTI,
  PDF_MIME,
  PDF_UTI,
  renderPdfBase64,
} from "./exportFile";
import { safeFileName } from "./share";

/**
 * The per-resident report, in both formats the admin can take away.
 *
 * PDF is the readable record — a header block plus one table per section, laid
 * out for paper. CSV is the same data for anyone who wants to work on it in
 * Excel; because a spreadsheet has no notion of sections, the sections are
 * stacked with a title row and a blank line between them, which Excel opens
 * cleanly and a human can still read.
 *
 * Which sections appear is the caller's choice — an admin exporting a payment
 * dispute does not want twelve pages of visitor log attached.
 */

type RouterOutputs = inferRouterOutputs<ServerRouter>;
export type ResidentDetail = RouterOutputs["resident"]["detail"];

export type ReportSection =
  | "profile"
  | "family"
  | "vehicles"
  | "visitors"
  | "tickets"
  | "bookings"
  | "dues"
  | "payments";

/** Order is the order they appear in both outputs. */
export const REPORT_SECTIONS: ReportSection[] = [
  "profile",
  "family",
  "vehicles",
  "visitors",
  "tickets",
  "bookings",
  "dues",
  "payments",
];

/** Minimal shape of i18next's `t`, so this module needn't import i18next. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = "—";

interface Table {
  title: string;
  columns: string[];
  rows: string[][];
  /** Shown instead of the table when there is nothing to list. */
  emptyLabel: string;
}

/**
 * Every section as a titled table. `profile` is a two-column key/value table
 * rather than a special case, so the PDF and CSV writers each stay a single
 * loop over one shape.
 */
function buildTables(
  detail: ResidentDetail,
  sections: ReportSection[],
  t: Translate,
): Table[] {
  const { profile } = detail;
  const chosen = REPORT_SECTIONS.filter((section) => sections.includes(section));

  return chosen.map((section): Table => {
    switch (section) {
      case "profile":
        return {
          title: t("admin.residentReport.sections.profile"),
          columns: [t("admin.residentReport.field"), t("admin.residentReport.value")],
          emptyLabel: DASH,
          rows: [
            [t("signup.name"), profile.name],
            [t("signup.email"), profile.email ?? DASH],
            [t("signup.phone"), profile.phone ?? DASH],
            [
              t("admin.flat"),
              t("guard.flatLine", { tower: profile.towerName, flat: profile.flatNumber }),
            ],
            [t("admin.floor"), String(profile.floor)],
            [t("admin.residentReport.flatType"), t(`enums.flatType.${profile.flatType}`)],
            [
              t("common.primary"),
              profile.isPrimaryResident ? t("common.done") : DASH,
            ],
            [
              t("status.active"),
              profile.isActive ? t("status.active") : t("admin.inactive"),
            ],
            [t("admin.residentReport.joined"), formatDate(profile.joinedAt)],
            [
              t("admin.residentReport.movedIn"),
              profile.moveInDate ? formatDate(profile.moveInDate) : DASH,
            ],
            [t("profile.emergencyContact"), profile.emergencyContactName ?? DASH],
            [
              t("profileSetup.contactPhone"),
              profile.emergencyContactPhone ?? DASH,
            ],
          ],
        };

      case "family":
        return {
          title: t("admin.residentReport.sections.family"),
          columns: [t("signup.name"), t("family.relation"), t("family.ageLabel")],
          emptyLabel: t("family.empty"),
          rows: detail.familyMembers.map((member) => [
            member.name,
            member.relation,
            member.age === null ? DASH : String(member.age),
          ]),
        };

      case "vehicles":
        return {
          title: t("admin.residentReport.sections.vehicles"),
          columns: [t("vehicles.number"), t("admin.residentReport.type")],
          emptyLabel: t("vehicles.empty"),
          rows: detail.vehicles.map((vehicle) => [
            vehicle.number,
            t(`enums.vehicleType.${vehicle.type}`),
          ]),
        };

      case "visitors":
        return {
          title: t("admin.residentReport.sections.visitors"),
          columns: [
            t("admin.visitorLog.colDateTime"),
            t("admin.visitorLog.colVisitor"),
            t("admin.visitorLog.colPurpose"),
            t("admin.visitorLog.colStatus"),
            t("admin.visitorLog.colEntry"),
            t("admin.visitorLog.colExit"),
          ],
          emptyLabel: t("visitors.noHistory"),
          rows: detail.visitors.map((visitor) => [
            formatDateTime(visitor.createdAt),
            `${visitor.name} (${visitor.phone})`,
            t(`enums.visitorPurpose.${visitor.purpose}`),
            t(`enums.visitorStatus.${visitor.status}`),
            visitor.entryTime ? formatDateTime(visitor.entryTime) : DASH,
            visitor.exitTime ? formatDateTime(visitor.exitTime) : DASH,
          ]),
        };

      case "tickets":
        return {
          title: t("admin.residentReport.sections.tickets"),
          columns: [
            t("tickets.reference"),
            t("tickets.titleLabel"),
            t("tickets.category"),
            t("tickets.priority"),
            t("admin.setStatus"),
            t("admin.residentReport.raisedOn"),
          ],
          emptyLabel: t("tickets.empty"),
          rows: detail.tickets.map((ticket) => [
            ticket.referenceCode,
            ticket.title,
            t(`enums.ticketCategory.${ticket.category}`),
            t(`enums.ticketPriority.${ticket.priority}`),
            t(`enums.ticketStatus.${ticket.status}`),
            formatDate(ticket.createdAt),
          ]),
        };

      case "bookings":
        return {
          title: t("admin.residentReport.sections.bookings"),
          columns: [
            t("admin.residentReport.amenity"),
            t("amenities.pickDate"),
            t("admin.residentReport.slot"),
            t("admin.setStatus"),
            t("admin.residentReport.amount"),
          ],
          emptyLabel: t("amenities.noBookings"),
          rows: detail.bookings.map((booking) => [
            booking.amenityName,
            formatDate(booking.date),
            `${booking.startTime}–${booking.endTime}`,
            t(`enums.bookingStatus.${booking.status}`),
            booking.amountDue === null ? t("amenities.free") : formatMoney(booking.amountDue),
          ]),
        };

      case "dues":
        return {
          title: t("admin.residentReport.sections.dues"),
          columns: [
            t("admin.residentReport.period"),
            t("admin.residentReport.amount"),
            t("admin.residentReport.dueDate"),
            t("admin.setStatus"),
          ],
          emptyLabel: t("payments.noDues"),
          rows: detail.dues.map((due) => [
            `${t(`months.${MONTH_KEYS[due.month - 1] ?? "jan"}`)} ${due.year}`,
            formatMoney(due.amount),
            formatDate(due.dueDate),
            t(`enums.dueStatus.${due.status}`),
          ]),
        };

      case "payments":
        return {
          title: t("admin.residentReport.sections.payments"),
          columns: [
            t("admin.residentReport.paidOn"),
            t("admin.residentReport.paidFor"),
            t("admin.residentReport.amount"),
            t("admin.residentReport.method"),
            t("admin.setStatus"),
            t("admin.residentReport.reference"),
          ],
          emptyLabel: t("payments.noHistory"),
          rows: detail.payments.map((payment) => [
            formatDate(payment.paidAt ?? payment.createdAt),
            payment.target,
            formatMoney(payment.amount),
            t(`enums.paymentMethod.${payment.method}`),
            t(`enums.paymentStatus.${payment.status}`),
            payment.transactionId ?? payment.upiUtr ?? DASH,
          ]),
        };
    }
  });
}

/** i18n month keys, indexed by `month - 1`. Mirrors utils/format's MONTH_KEYS. */
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function fileStem(detail: ResidentDetail, now: Date): string {
  return safeFileName(
    `resident-${detail.profile.name}-${detail.profile.towerName}-${detail.profile.flatNumber}-${now
      .toISOString()
      .slice(0, 10)}`,
  );
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function buildResidentReportPdf(params: {
  detail: ResidentDetail;
  sections: ReportSection[];
  societyName: string;
  t: Translate;
  now?: Date;
}): Promise<ExportFile> {
  const { detail, sections, societyName, t } = params;
  const now = params.now ?? new Date();
  const tables = buildTables(detail, sections, t);
  const { profile } = detail;

  const body = tables
    .map((table) => {
      const inner =
        table.rows.length === 0
          ? `<p class="empty">${escapeHtml(table.emptyLabel)}</p>`
          : `<table>
              <thead><tr>${table.columns
                .map((column) => `<th>${escapeHtml(column)}</th>`)
                .join("")}</tr></thead>
              <tbody>${table.rows
                .map(
                  (row) =>
                    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
                )
                .join("")}</tbody>
            </table>`;
      return `<section><h2>${escapeHtml(table.title)}</h2>${inner}</section>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 14mm 12mm; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #111827;
        font-size: 10px;
        margin: 0;
      }
      header { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px; }
      .society { font-size: 11px; font-weight: 600; color: #2563eb; margin: 0 0 2px; }
      h1 { font-size: 17px; margin: 0 0 3px; }
      .meta { color: #6b7280; font-size: 9px; margin: 0; }
      .meta span + span::before { content: " · "; }
      section { margin-bottom: 14px; page-break-inside: auto; }
      h2 {
        font-size: 11px;
        margin: 0 0 5px;
        padding-bottom: 3px;
        border-bottom: 1px solid #e5e7eb;
        color: #374151;
      }
      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; }
      th {
        text-align: left;
        background: #f3f4f6;
        border-bottom: 1px solid #d1d5db;
        padding: 5px;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #374151;
      }
      td { padding: 4px 5px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      tr { page-break-inside: avoid; }
      tbody tr:nth-child(even) { background: #fafafa; }
      .empty { color: #9ca3af; margin: 4px 0 0; }
      footer { margin-top: 16px; color: #9ca3af; font-size: 8px; }
    </style>
  </head>
  <body>
    <header>
      <p class="society">${escapeHtml(societyName)}</p>
      <h1>${escapeHtml(profile.name)}</h1>
      <p class="meta">
        <span>${escapeHtml(
          t("guard.flatLine", { tower: profile.towerName, flat: profile.flatNumber }),
        )}</span>
        <span>${escapeHtml(profile.email ?? profile.phone ?? DASH)}</span>
        <span>${escapeHtml(
          t("admin.visitorLog.generatedAt", { when: formatDateTime(now) }),
        )}</span>
      </p>
    </header>
    ${body}
    <footer>${escapeHtml(t("admin.residentReport.footer", { society: societyName }))}</footer>
  </body>
</html>`;

  return {
    fileName: `${fileStem(detail, now)}.pdf`,
    mimeType: PDF_MIME,
    uti: PDF_UTI,
    encoding: "base64",
    contents: await renderPdfBase64(html),
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function buildResidentReportCsv(params: {
  detail: ResidentDetail;
  sections: ReportSection[];
  societyName: string;
  t: Translate;
  now?: Date;
}): ExportFile {
  const { detail, sections, societyName, t } = params;
  const now = params.now ?? new Date();
  const tables = buildTables(detail, sections, t);
  const { profile } = detail;

  const lines: string[] = [
    csvRow([societyName]),
    csvRow([
      profile.name,
      t("guard.flatLine", { tower: profile.towerName, flat: profile.flatNumber }),
      profile.email ?? profile.phone ?? "",
    ]),
    csvRow([t("admin.visitorLog.generatedAt", { when: formatDateTime(now) })]),
  ];

  for (const table of tables) {
    lines.push("");
    lines.push(csvRow([table.title]));
    if (table.rows.length === 0) {
      lines.push(csvRow([table.emptyLabel]));
      continue;
    }
    lines.push(csvRow(table.columns));
    for (const row of table.rows) lines.push(csvRow(row));
  }

  return {
    fileName: `${fileStem(detail, now)}.csv`,
    mimeType: CSV_MIME,
    uti: CSV_UTI,
    encoding: "utf8",
    contents: csvDocument(lines),
  };
}
