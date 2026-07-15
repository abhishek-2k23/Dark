/** Color math helpers for the glass/neon style layer. */

/**
 * Apply an alpha channel to a `#RRGGBB` hex color, returning an rgba string.
 * Passes through colors that are already rgba/rgb unchanged when alpha is 1.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const int = parseInt(match[1]!, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
