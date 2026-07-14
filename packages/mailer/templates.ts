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
