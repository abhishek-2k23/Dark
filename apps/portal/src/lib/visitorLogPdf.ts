import { PDF_MIME, PDF_UTI, renderPdfBase64, type ExportFile } from "./exportFile";
import { safeFileName } from "./share";

/**
 * Visitor log → PDF, rendered on-device.
 *
 * expo-print turns an HTML string into a real PDF, which the share sheet then
 * offers to save or send. Doing it here rather than server-side means the
 * export covers exactly the rows the admin is looking at, works without a new
 * binary-response endpoint, and needs no file storage.
 *
 * Everything user-visible arrives pre-localised from the calling screen — this
 * module owns layout, not wording.
 */

export interface VisitorLogPdfRow {
  createdAt: string;
  name: string;
  phone: string;
  towerName: string;
  flatNumber: string;
  /** Already-localised purpose label. */
  purpose: string;
  /** Already-localised status label. */
  status: string;
  entryTime: string | null;
  exitTime: string | null;
  vehicleNumber: string | null;
}

export interface VisitorLogPdfOptions {
  fileName: string;
  title: string;
  societyName: string;
  /** e.g. "This month" — which window the rows cover. */
  periodLabel: string;
  /** e.g. "Generated 25 Jul 2026, 6:40 pm". */
  generatedLabel: string;
  /** e.g. "128 visitors". */
  countLabel: string;
  emptyLabel: string;
  /** Small print at the end of the document. */
  footerNote: string;
  columns: {
    dateTime: string;
    visitor: string;
    flat: string;
    purpose: string;
    status: string;
    entry: string;
    exit: string;
    vehicle: string;
  };
  rows: VisitorLogPdfRow[];
  /** Formats an ISO timestamp for display; supplied so locale rules stay in one place. */
  formatDateTime: (iso: string) => string;
  formatTime: (iso: string) => string;
}

/**
 * Visitor names, phone numbers and vehicle plates are attacker-influenced free
 * text (a guard types whatever the visitor says). They are interpolated into
 * HTML here, so every value goes through this first.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DASH = "—";

function buildHtml(options: VisitorLogPdfOptions): string {
  const { columns, rows } = options;

  const headerCells = [
    columns.dateTime,
    columns.visitor,
    columns.flat,
    columns.purpose,
    columns.status,
    columns.entry,
    columns.exit,
    columns.vehicle,
  ]
    .map((label) => `<th>${escapeHtml(label)}</th>`)
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = [
        options.formatDateTime(row.createdAt),
        // Pre-escaped, because this is the one cell that carries markup of its
        // own and so bypasses the blanket escape below.
        `${escapeHtml(row.name)}<br /><span class="muted">${escapeHtml(row.phone)}</span>`,
        `${row.towerName} ${DASH} ${row.flatNumber}`,
        row.purpose,
        row.status,
        row.entryTime ? options.formatTime(row.entryTime) : DASH,
        row.exitTime ? options.formatTime(row.exitTime) : DASH,
        row.vehicleNumber || DASH,
      ];
      // The visitor cell is pre-escaped above because it carries markup.
      const rendered = cells.map((cell, index) =>
        index === 1 ? cell : escapeHtml(cell),
      );
      return `<tr>${rendered.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    })
    .join("");

  const table =
    rows.length > 0
      ? `<table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`
      : `<p class="empty">${escapeHtml(options.emptyLabel)}</p>`;

  // Landscape: eight columns do not read well on portrait A4. Deliberately a
  // light, print-first stylesheet — no app theming, since this is going to
  // paper and to people outside the app.
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4 landscape; margin: 14mm 12mm; }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #111827;
        font-size: 10px;
        margin: 0;
      }
      header { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 12px; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .society { font-size: 12px; font-weight: 600; color: #2563eb; margin: 0 0 4px; }
      .meta { color: #6b7280; font-size: 9px; margin: 0; }
      .meta span + span::before { content: " · "; }
      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; }
      th {
        text-align: left;
        background: #f3f4f6;
        border-bottom: 1px solid #d1d5db;
        padding: 6px 5px;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #374151;
      }
      td { padding: 5px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      tr { page-break-inside: avoid; }
      tbody tr:nth-child(even) { background: #fafafa; }
      .muted { color: #6b7280; font-size: 9px; }
      .empty { color: #6b7280; padding: 24px 0; text-align: center; }
      footer { margin-top: 14px; color: #9ca3af; font-size: 8px; }
    </style>
  </head>
  <body>
    <header>
      <p class="society">${escapeHtml(options.societyName)}</p>
      <h1>${escapeHtml(options.title)}</h1>
      <p class="meta">
        <span>${escapeHtml(options.periodLabel)}</span>
        <span>${escapeHtml(options.countLabel)}</span>
        <span>${escapeHtml(options.generatedLabel)}</span>
      </p>
    </header>
    ${table}
    <footer>${escapeHtml(options.footerNote)}</footer>
  </body>
</html>`;
}

/**
 * Render the log to a PDF. The caller decides whether it gets saved or shared —
 * see `download.ts` and `share.ts`.
 */
export async function buildVisitorLogPdf(
  options: VisitorLogPdfOptions,
): Promise<ExportFile> {
  return {
    fileName: options.fileName,
    mimeType: PDF_MIME,
    uti: PDF_UTI,
    encoding: "base64",
    contents: await renderPdfBase64(buildHtml(options)),
  };
}

/** `visitor-log-this-month-2026-07-25.pdf` — stable, sortable, safe on any OS. */
export function visitorLogFileName(periodSlug: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return safeFileName(`visitor-log-${periodSlug}-${date}.pdf`);
}
