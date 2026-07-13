/**
 * JS-side mirror of the semantic tokens declared in `global.css`.
 *
 * Prefer NativeWind classes (`bg-surface`, `text-content`, …) for styling.
 * Use these values only when you need a raw color string that Tailwind can't
 * reach: vector-icon `color` props, gradients, the status bar, shadows, etc.
 * Read them through `useTheme()` so they follow the active light/dark scheme.
 */

export type ColorScheme = "light" | "dark";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;

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
}

export const lightColors: ThemeColors = {
  background: "#F5F6FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F1F8",
  surfaceElevated: "#FFFFFF",

  border: "#E2E4F0",
  borderStrong: "#D1D5E1",

  content: "#1A1D2E",
  contentSecondary: "#6B7280",
  contentTertiary: "#9CA3AF",
  contentInverse: "#FFFFFF",

  primary: "#1E3A8A",
  primaryStrong: "#0F2A6B",
  primarySoft: "#E8EAFB",
  onPrimary: "#FFFFFF",

  success: "#0F7A4D",
  successSoft: "#CFF5E4",
  onSuccess: "#FFFFFF",

  accent: "#34D399",
  accentStrong: "#065F46",

  warning: "#D97706",
  warningSoft: "#FEF3D6",

  danger: "#DC2626",
  dangerSoft: "#FCE9E9",

  info: "#25348C",
  peachSoft: "#FCE7CE",
};

export const darkColors: ThemeColors = {
  background: "#0E1117",
  surface: "#171C29",
  surfaceMuted: "#202636",
  surfaceElevated: "#1E2434",

  border: "#2C3242",
  borderStrong: "#3C4458",

  content: "#F3F4F6",
  contentSecondary: "#9AA3B2",
  contentTertiary: "#6B7280",
  contentInverse: "#0F1219",

  primary: "#7894F0",
  primaryStrong: "#5474DC",
  primarySoft: "#1E2846",
  onPrimary: "#FFFFFF",

  success: "#34C58A",
  successSoft: "#122E24",
  onSuccess: "#FFFFFF",

  accent: "#34D399",
  accentStrong: "#6EE7B7",

  warning: "#F5B042",
  warningSoft: "#3A2C14",

  danger: "#F87171",
  dangerSoft: "#3C1E1E",

  info: "#7894F0",
  peachSoft: "#3A2C1C",
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
