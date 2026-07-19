import { TRPCError } from "@trpc/server";

/**
 * UPI deep links for the peer-to-peer rail.
 *
 * We build the intent URI and hand it to the client; we never render the QR
 * server-side, because the same URI is the QR payload and mobile/web already
 * have renderers. Keeping it a string avoids an image dependency in the API
 * and lets the client size the code to its own layout.
 */

/**
 * `username@handle`. Deliberately permissive on the handle — new PSPs appear
 * regularly and an allow-list of banks would reject valid VPAs. This catches
 * typos in shape (missing @, spaces, empty side), not wrong-but-well-formed
 * addresses; nothing short of a gateway lookup can catch those, which is why
 * the UI also asks for the VPA twice and shows the resolved payee name.
 */
const VPA_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,255}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_PATTERN.test(vpa);
}

export function assertValidVpa(vpa: string): void {
  if (!isValidVpa(vpa)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That does not look like a UPI ID (expected something like name@bank)",
    });
  }
}

export interface UpiIntent {
  /** `upi://pay?...` — open on Android, and the QR payload everywhere. */
  uri: string;
  /** Shown next to the QR so the payer can pay by hand if the link fails. */
  vpa: string;
  payeeName: string;
  amount: number;
  note: string;
}

/**
 * UPI transaction notes are truncated by most PSP apps around 50 characters,
 * and some reject the whole intent on unexpected punctuation. Trimming here
 * keeps the note readable in the payer's app rather than cut mid-word.
 */
function shortNote(note: string): string {
  const cleaned = note.replace(/[^\w\s\-/:.,]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return `${cleaned.slice(0, 47).trimEnd()}...`;
}

export function buildUpiIntent(input: {
  vpa: string;
  payeeName: string;
  amount: number;
  note: string;
}): UpiIntent {
  assertValidVpa(input.vpa);

  const note = shortNote(input.note);
  // Two decimals always: some PSP apps reject bare integers, and an amount
  // like "1200.5" is ambiguous enough that it is worth normalising.
  const amount = input.amount.toFixed(2);

  const params = new URLSearchParams({
    pa: input.vpa,
    pn: input.payeeName,
    am: amount,
    cu: "INR",
    tn: note,
  });

  return {
    uri: `upi://pay?${params.toString()}`,
    vpa: input.vpa,
    payeeName: input.payeeName,
    amount: Number(amount),
    note,
  };
}
