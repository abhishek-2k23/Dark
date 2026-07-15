import type { NeonHue } from "./colors";

/**
 * Single source of truth mapping app features to their neon accent hue.
 * Keeps icon/tile tinting consistent everywhere a feature appears — change a
 * feature's color here and it updates app-wide.
 *
 * Only two hues exist by design (see `NeonHue`), so this no longer identifies a
 * feature on its own — it splits them along a rough "people and places" (blue)
 * vs "money, admin and social" (violet) line, and the icon glyph plus label do
 * the actual identifying work.
 */
export const FEATURE_HUE = {
  home: "blue",
  visitors: "blue",
  guests: "blue",
  payments: "violet",
  bills: "violet",
  community: "violet",
  polls: "violet",
  directory: "violet",
  amenities: "blue",
  vehicles: "blue",
  tickets: "violet",
  alerts: "violet",
  notices: "blue",
  events: "blue",
  family: "violet",
  profile: "violet",
  settings: "blue",
  staff: "blue",
  reports: "violet",
} as const satisfies Record<string, NeonHue>;

export type FeatureKey = keyof typeof FEATURE_HUE;

/** Neon hue for a feature; defaults to the brand blue for unknown keys. */
export function hueFor(feature: FeatureKey | (string & {})): NeonHue {
  return FEATURE_HUE[feature as FeatureKey] ?? "blue";
}
