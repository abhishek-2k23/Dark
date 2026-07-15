/** Spacing, radius and elevation tokens shared by the JS style layer. */

/** 4pt spacing scale. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  full: 999,
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;

/**
 * Cross-platform elevation presets. iOS reads the shadow* props; Android reads
 * `elevation`. Shadow color stays dark on both themes (a soft dark shadow works
 * on light surfaces; on dark surfaces elevation is mostly conveyed by the
 * surface tint, so a subtle shadow is harmless).
 */
export const elevation = {
  none: {},
  sm: {
    shadowColor: "#0B1533",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#0B1533",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: "#0B1533",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export type ElevationToken = keyof typeof elevation;

/**
 * Neon glow shadow for glass surfaces. iOS renders the colored halo; Android
 * elevation shadows can't be tinted reliably, so depth there is carried by
 * the aurora backdrop + hairline borders (elevation stays 0 on purpose).
 */
export function glow(color: string, intensity: "sm" | "md" | "lg" = "md") {
  const preset = {
    sm: { shadowOpacity: 0.25, shadowRadius: 8 },
    md: { shadowOpacity: 0.4, shadowRadius: 14 },
    lg: { shadowOpacity: 0.55, shadowRadius: 22 },
  }[intensity];
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    ...preset,
    elevation: 0,
  } as const;
}

/** Shared geometry for the floating glass tab bar + Screen bottom insets. */
export const tabBar = {
  height: 64,
  margin: 16,
  bottomOffset: 12,
} as const;
