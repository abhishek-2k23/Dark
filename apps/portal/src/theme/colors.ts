/**
 * JS-side mirror of the semantic tokens declared in `global.css`.
 *
 * Prefer NativeWind classes (`bg-surface`, `text-content`, …) for styling.
 * Use these values only when you need a raw color string that Tailwind can't
 * reach: vector-icon `color` props, gradients, the status bar, shadows, etc.
 * Read them through `useTheme()` so they follow the active light/dark scheme.
 */

export type ColorScheme = "light" | "dark";

/** Pastel-neon feature hues. Registry mapping features → hues: `hues.ts`. */
export type NeonHue = "blue" | "violet" | "gold" | "green" | "pink" | "cyan";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;

  /** Translucent glass card fill (rgba). */
  glassFill: string;
  /** Stronger glass fill for emphasized surfaces (rgba). */
  glassFillStrong: string;
  /** 1px luminous hairline for glass borders (rgba). */
  glassBorder: string;
  /** Near-opaque inner fill for neon-gradient-border cards (rgba). */
  glassHeavy: string;

  border: string;
  borderStrong: string;

  content: string;
  contentSecondary: string;
  contentTertiary: string;
  contentInverse: string;

  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;

  success: string;
  successSoft: string;
  onSuccess: string;

  accent: string;
  accentStrong: string;

  warning: string;
  warningSoft: string;

  danger: string;
  dangerSoft: string;

  info: string;
  peachSoft: string;

  /** Pastel-neon accent hues for icons, tints and gradient borders. */
  neon: Record<NeonHue, string>;

  /** Ambient background glow blob colors (AuroraBackground). */
  aurora: string[];
}

export const lightColors: ThemeColors = {
  background: "#F0F3FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F5FB",
  surfaceElevated: "#FFFFFF",

  glassFill: "rgba(255,255,255,0.65)",
  glassFillStrong: "rgba(255,255,255,0.8)",
  glassBorder: "rgba(255,255,255,0.75)",
  glassHeavy: "rgba(255,255,255,0.92)",

  border: "#E0E4F2",
  borderStrong: "#CDD3E6",

  content: "#171A2B",
  contentSecondary: "#646C82",
  contentTertiary: "#989FB2",
  contentInverse: "#FFFFFF",

  primary: "#2563EB",
  primaryStrong: "#1D4ED8",
  primarySoft: "#DBEAFE",
  onPrimary: "#FFFFFF",

  success: "#047857",
  successSoft: "#D1FAE5",
  onSuccess: "#FFFFFF",

  accent: "#0D9488",
  accentStrong: "#0F766E",

  warning: "#CA6C02",
  warningSoft: "#FEF3D6",

  danger: "#DC2626",
  dangerSoft: "#FEE2E2",

  info: "#2563EB",
  peachSoft: "#FDE6CD",

  neon: {
    blue: "#2563EB",
    violet: "#7C3AED",
    gold: "#CA6C02",
    green: "#059669",
    pink: "#DB2777",
    cyan: "#0891B2",
  },

  // Soft pastel blobs — quiet frosted interpretation for light mode.
  aurora: ["#BFD4FE", "#DDD1FE", "#FDE9C0"],
};

export const darkColors: ThemeColors = {
  background: "#050508",
  surface: "#11111A",
  surfaceMuted: "#181824",
  surfaceElevated: "#161622",

  glassFill: "rgba(255,255,255,0.06)",
  glassFillStrong: "rgba(255,255,255,0.1)",
  glassBorder: "rgba(255,255,255,0.1)",
  glassHeavy: "rgba(13,13,20,0.92)",

  border: "#2A2C3E",
  borderStrong: "#3E425C",

  content: "#F5F5FA",
  contentSecondary: "#A3A8BE",
  contentTertiary: "#6E738C",
  contentInverse: "#0A0A10",

  primary: "#60A5FA",
  primaryStrong: "#3B82F6",
  primarySoft: "#16233F",
  onPrimary: "#060C1A",

  success: "#34D399",
  successSoft: "#082C20",
  onSuccess: "#04140E",

  accent: "#34D399",
  accentStrong: "#6EE7B7",

  warning: "#FBBF24",
  warningSoft: "#382A0C",

  danger: "#FB7185",
  dangerSoft: "#3A161E",

  info: "#60A5FA",
  peachSoft: "#382A1A",

  neon: {
    blue: "#60A5FA",
    violet: "#A78BFA",
    gold: "#FBBF24",
    green: "#34D399",
    pink: "#F472B6",
    cyan: "#22D3EE",
  },

  // Neon glow blobs bleeding through the near-black canvas.
  aurora: ["#7C3AED", "#2563EB", "#B45309"],
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
