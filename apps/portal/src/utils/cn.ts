type ClassValue = string | number | null | false | undefined | ClassValue[];

/**
 * Tiny className joiner (clsx-lite). Later classes are kept as-is — NativeWind
 * resolves ordering, and we keep component base classes ahead of the caller's
 * `className` so overrides win.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else {
      out.push(String(input));
    }
  }
  return out.join(" ");
}
