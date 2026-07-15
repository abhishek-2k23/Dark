import type { NeonHue } from "./colors";

/**
 * Single source of truth mapping app features to their neon accent hue.
 * Keeps icon/tile/badge tinting consistent everywhere a feature appears —
 * change a feature's color here and it updates app-wide.
 */
export const FEATURE_HUE = {
  home: "blue",
  visitors: "blue",
  guests: "blue",
  payments: "gold",
  bills: "gold",
  community: "violet",
  polls: "violet",
  directory: "violet",
  amenities: "green",
  vehicles: "green",
  tickets: "pink",
  alerts: "pink",
  notices: "cyan",
  events: "cyan",
  family: "pink",
  profile: "violet",
  settings: "cyan",
  staff: "green",
  reports: "gold",
} as const satisfies Record<string, NeonHue>;

export type FeatureKey = keyof typeof FEATURE_HUE;

/** Neon hue for a feature; defaults to the brand blue for unknown keys. */
export function hueFor(feature: FeatureKey | (string & {})): NeonHue {
  return FEATURE_HUE[feature as FeatureKey] ?? "blue";
}
