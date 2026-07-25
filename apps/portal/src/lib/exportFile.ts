import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";

/**
 * One generated file, in the single shape every export in the app produces.
 *
 * Report builders return this and stay ignorant of what happens next; the
 * screen decides whether it gets saved (`download.ts`) or handed to the share
 * sheet (`share.ts`). That is what lets every export offer both a download and
 * a share button without each one implementing the pair twice.
 */
export interface ExportFile {
  /** Including extension, e.g. "resident-ravi-kumar-2026-07-25.pdf". */
  fileName: string;
  mimeType: string;
  /** Text for CSV, base64 for binary such as PDF. */
  contents: string;
  encoding: "utf8" | "base64";
  /** iOS Uniform Type Identifier for the share sheet. */
  uti?: string;
}

export const PDF_MIME = "application/pdf";
export const PDF_UTI = "com.adobe.pdf";
export const CSV_MIME = "text/csv";
export const CSV_UTI = "public.comma-separated-values-text";

/**
 * Render HTML to a PDF and return it as base64.
 *
 * expo-print writes to a temp file, but both the download and share paths want
 * bytes they can place themselves, so it is read straight back out. The temp
 * file is left for the OS to reap — deleting it here would race the share sheet,
 * which reads the URI lazily.
 */
export async function renderPdfBase64(html: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Quote one CSV field per RFC 4180. Everything is quoted rather than only the
 * fields that need it: names and notes routinely contain commas, and a stray
 * unquoted one silently shifts every later column.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Join CSV lines with CRLF and a UTF-8 BOM.
 *
 * The BOM is what makes Excel open Devanagari and rupee signs correctly instead
 * of mojibake — without it Excel assumes the system codepage.
 */
export function csvDocument(lines: string[]): string {
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** HTML-escape a value before interpolating it into a report template. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
