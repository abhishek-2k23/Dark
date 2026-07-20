import crypto from "node:crypto";

/**
 * Gate-pass codes are read aloud, typed on a phone at a gate at night, and
 * sometimes copied off a printout — so they are short and shaped, not random
 * hex. A code is exactly 6 characters: 4 digits and 2 letters, shuffled.
 *
 * Ambiguous glyphs are excluded from both alphabets (no O/0, I/1, S/5, B/8, Z/2)
 * so a misread never turns one valid code into another.
 */

// Every digit is kept: ambiguity is resolved on the letter side instead, by
// dropping the five letters that have a digit twin. That leaves all 10 digits
// usable and still admits no misreadable pair.
const LETTERS = "ACDEFGHJKLMNPQRTUVWXY"; // no B(8), I(1), O(0), S(5), Z(2)
const DIGITS = "0123456789";

export const PASS_CODE_LENGTH = 6;
export const PASS_CODE_DIGITS = 4;
export const PASS_CODE_LETTERS = 2;

/** A valid code: 6 alphanumerics, at most 4 digits and at most 2 letters. */
const PASS_CODE_RE = /^[A-Z0-9]{6}$/;

function pick(alphabet: string): string {
  return alphabet[crypto.randomInt(alphabet.length)]!;
}

/**
 * Normalises whatever the guard typed or the scanner read into the canonical
 * form: uppercase, with separators the user may have added (spaces, hyphens)
 * stripped. Lets "ab-12 34" match the stored "AB1234".
 */
export function normalisePassCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True if `raw` could be a pass code at all — used to fail fast before a query. */
export function isPassCodeShaped(raw: string): boolean {
  const code = normalisePassCode(raw);
  if (!PASS_CODE_RE.test(code)) return false;
  const digits = code.replace(/[^0-9]/g, "").length;
  return digits <= PASS_CODE_DIGITS && code.length - digits <= PASS_CODE_LETTERS;
}

/** One candidate code — 4 digits + 2 letters in a random order. */
export function generatePassCode(): string {
  const chars = [
    ...Array.from({ length: PASS_CODE_DIGITS }, () => pick(DIGITS)),
    ...Array.from({ length: PASS_CODE_LETTERS }, () => pick(LETTERS)),
  ];
  // Fisher-Yates with a CSPRNG so the letter positions aren't predictable.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/**
 * A code no existing pass holds. The space is C(6,2)·21²·10⁴ ≈ 66M; `qrCode` is
 * globally unique in the schema, so `isTaken` must consider *every* pass ever
 * issued, not just live ones. Collisions stay rare at that size but are not
 * impossible, hence the bounded retry rather than a single shot.
 */
export async function generateUniquePassCode(
  isTaken: (code: string) => Promise<boolean>,
  attempts = 10,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generatePassCode();
    if (!(await isTaken(code))) return code;
  }
  throw new Error("Could not generate an unused pass code");
}
