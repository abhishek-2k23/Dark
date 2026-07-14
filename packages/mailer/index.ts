import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@repo/logger";

/**
 * SMTP mailer. Configuration is read once from the environment; when it's
 * absent the mailer degrades gracefully — sends are logged and skipped rather
 * than throwing — so local dev keeps working without an SMTP server (pair with
 * OTP_DEV_ECHO to read codes straight from the API response).
 *
 * Env:
 *   SMTP_HOST     e.g. smtp.gmail.com          (required to enable sending)
 *   SMTP_PORT     default 587
 *   SMTP_SECURE   "true" for implicit TLS (port 465); default false (STARTTLS)
 *   SMTP_USER     SMTP username / login
 *   SMTP_PASS     SMTP password / app-password
 *   SMTP_FROM     From header, e.g. "Portl Society <no-reply@example.com>"
 *                 (falls back to SMTP_USER)
 */

interface Configured {
  transporter: Transporter;
  from: string;
}

// `undefined` = not yet resolved, `null` = resolved-but-unconfigured.
let cached: Configured | null | undefined;

function resolveTransport(): Configured | null {
  if (cached !== undefined) return cached;

  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  if (!host || !from) {
    cached = null;
    return cached;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  cached = { transporter, from };
  return cached;
}

/** True when SMTP is configured; false means sends are logged and skipped. */
export function isMailerConfigured(): boolean {
  return resolveTransport() !== null;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Never throws: an unconfigured mailer logs a warning and a
 * delivery failure logs an error, so callers (auth flows) stay resilient — the
 * account state is already persisted and the code/token can be re-requested.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  const transport = resolveTransport();
  if (!transport) {
    logger.warn("Mailer not configured — email not sent", {
      to: msg.to,
      subject: msg.subject,
    });
    return;
  }

  try {
    await transport.transporter.sendMail({
      from: transport.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    logger.info("Email sent", { to: msg.to, subject: msg.subject });
  } catch (err) {
    logger.error("Failed to send email", {
      to: msg.to,
      subject: msg.subject,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export * from "./templates";
