import { sendMail } from "./index";

const APP_NAME = "Prangan";

/** Minimal branded HTML shell shared by transactional emails. */
function shell(heading: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#208AEF;padding:20px 28px;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;">${APP_NAME}</div>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${heading}</h1>
            ${body}
          </td></tr>
          <tr><td style="padding:0 28px 28px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">If you didn't request this, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Deliver an email-verification OTP. `ttlMinutes` is surfaced in the copy so it
 * stays in sync with the code's actual expiry.
 */
export async function sendOtpEmail(params: {
  to: string;
  code: string;
  ttlMinutes: number;
}): Promise<void> {
  const { to, code, ttlMinutes } = params;
  const text = `Your ${APP_NAME} verification code is ${code}. It expires in ${ttlMinutes} minutes.`;
  const html = shell(
    "Verify your email",
    `<p style="margin:0 0 16px;font-size:14px;color:#374151;">Use this code to verify your email address:</p>
     <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;background:#f3f4f6;border-radius:10px;padding:16px;text-align:center;">${code}</div>
     <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">This code expires in ${ttlMinutes} minutes.</p>`,
  );
  await sendMail({ to, subject: `Your ${APP_NAME} verification code`, text, html });
}

/**
 * Deliver an account-deletion OTP. Same one-time-code shape as `sendOtpEmail`,
 * but the copy makes clear this confirms a *permanent* account deletion so the
 * recipient can react if they didn't request it.
 */
export async function sendAccountDeletionOtpEmail(params: {
  to: string;
  code: string;
  ttlMinutes: number;
}): Promise<void> {
  const { to, code, ttlMinutes } = params;
  const text = `Your ${APP_NAME} account-deletion code is ${code}. It expires in ${ttlMinutes} minutes. If you didn't request this, ignore this email and your account stays active.`;
  const html = shell(
    "Confirm account deletion",
    `<p style="margin:0 0 16px;font-size:14px;color:#374151;">Use this code to confirm permanent deletion of your ${APP_NAME} account:</p>
     <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;background:#f3f4f6;border-radius:10px;padding:16px;text-align:center;">${code}</div>
     <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">This code expires in ${ttlMinutes} minutes. If you didn't request this, ignore this email — your account stays active.</p>`,
  );
  await sendMail({ to, subject: `Confirm your ${APP_NAME} account deletion`, text, html });
}

/**
 * Deliver a password-reset token. The app's reset screen takes the token as
 * input (copy/paste), so it's shown as a code block rather than a link.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  token: string;
}): Promise<void> {
  const { to, token } = params;
  const text = `A password reset was requested for your ${APP_NAME} account. Paste this token into the app to continue:\n\n${token}`;
  const html = shell(
    "Reset your password",
    `<p style="margin:0 0 16px;font-size:14px;color:#374151;">A password reset was requested for your account. Paste this token into the reset screen in the app:</p>
     <div style="font-size:12px;font-family:monospace;color:#111827;background:#f3f4f6;border-radius:10px;padding:14px;word-break:break-all;">${token}</div>`,
  );
  await sendMail({ to, subject: `Reset your ${APP_NAME} password`, text, html });
}

/**
 * Email a guest their gate pass: the QR the guard scans, plus the same code in
 * text. The QR is rendered here and attached inline (cid:) rather than linked —
 * mail clients routinely block remote images and strip data: URIs, and a pass
 * whose QR doesn't render is worthless at a gate.
 *
 * The printed code is the fallback that makes this robust: if the scanner
 * won't read a phone screen in the sun, the guard can type the code.
 */
export async function sendGuestPassEmail(params: {
  to: string;
  guestName: string;
  societyName: string;
  flatLabel: string;
  hostName: string;
  qrCode: string;
  validFrom: Date;
  validTo: Date;
}): Promise<void> {
  const {
    to,
    guestName,
    societyName,
    flatLabel,
    hostName,
    qrCode,
    validFrom,
    validTo,
  } = params;

  const when = (d: Date) =>
    d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  const window = `${when(validFrom)} — ${when(validTo)}`;

  // Lazy import: only this template needs the QR encoder, and the mailer is
  // imported by every service.
  const QRCode = await import("qrcode");
  const png = await QRCode.toBuffer(qrCode, {
    type: "png",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const text = [
    `${guestName}, ${hostName} has invited you to ${societyName} (${flatLabel}).`,
    ``,
    `Show this pass at the gate. Valid ${window}.`,
    `Pass code: ${qrCode}`,
  ].join("\n");

  const html = shell(
    "Your gate pass",
    `<p style="margin:0 0 16px;font-size:14px;color:#374151;">
       <strong>${hostName}</strong> has invited you to <strong>${societyName}</strong> (${flatLabel}).
       Show this at the gate.
     </p>
     <div style="background:#f3f4f6;border-radius:10px;padding:20px;text-align:center;">
       <img src="cid:guestpass" width="220" height="220" alt="Gate pass QR code"
            style="display:block;margin:0 auto 12px;background:#ffffff;border-radius:8px;" />
       <div style="font-size:11px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Pass code</div>
       <div style="font-size:15px;font-weight:700;color:#111827;letter-spacing:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${qrCode}</div>
     </div>
     <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
       Valid <strong>${window}</strong>. The guard can scan the code or type it in.
     </p>`,
  );

  await sendMail({
    to,
    subject: `Your gate pass for ${societyName}`,
    text,
    html,
    attachments: [
      { filename: "gate-pass.png", content: png, cid: "guestpass", contentType: "image/png" },
    ],
  });
}

/**
 * Confirm a raised complaint and, more importantly, give the resident its
 * reference code — the handle they quote when they ring the office or chase it
 * at the desk. Deliberately plain: no QR, because this one is read, not scanned.
 */
export async function sendTicketRaisedEmail(params: {
  to: string;
  referenceCode: string;
  title: string;
  category: string;
}): Promise<void> {
  const { to, referenceCode, title, category } = params;
  const pretty = category.charAt(0) + category.slice(1).toLowerCase();

  const text = [
    `Your complaint has been logged.`,
    ``,
    `Reference: ${referenceCode}`,
    `Category:  ${pretty}`,
    `Subject:   ${title}`,
    ``,
    `Quote the reference when following up. You can track it in the ${APP_NAME} app.`,
  ].join("\n");

  const html = shell(
    "Complaint logged",
    `<p style="margin:0 0 16px;font-size:14px;color:#374151;">
       We've logged your complaint. Quote this reference when you follow up:
     </p>
     <div style="font-size:24px;font-weight:700;letter-spacing:3px;color:#111827;background:#f3f4f6;border-radius:10px;padding:16px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${referenceCode}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0;font-size:13px;color:#374151;">
       <tr><td style="padding:2px 12px 2px 0;color:#9ca3af;">Category</td><td>${pretty}</td></tr>
       <tr><td style="padding:2px 12px 2px 0;color:#9ca3af;">Subject</td><td>${title}</td></tr>
     </table>
     <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You can track progress in the ${APP_NAME} app.</p>`,
  );

  await sendMail({ to, subject: `${referenceCode} — your complaint is logged`, text, html });
}
