/**
 * Type system.
 *
 * Two families, loaded in the root layout:
 *   • Poppins  → headings, display, buttons (geometric, confident)
 *   • Nunito   → body & UI text (rounded, friendly, very legible)
 *
 * The string keys below match the font names registered by
 * `@expo-google-fonts/*`, and mirror the `fontFamily` keys in
 * tailwind.config.js so the `<Text>` component and NativeWind stay in sync.
 */

export const fontFamily = {
  body: "Nunito_400Regular",
  bodyMedium: "Nunito_500Medium",
  bodySemibold: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",

  heading: "Poppins_600SemiBold",
  headingMedium: "Poppins_500Medium",
  headingBold: "Poppins_700Bold",
} as const;

/** Font modules to feed into `useFonts`. */
// (imported directly in the root layout — kept there to avoid a huge import list here)

export type TypographyVariant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "title"
  | "subtitle"
  | "body"
  | "bodyLarge"
  | "bodySmall"
  | "caption"
  | "label"
  | "overline"
  | "button";

export interface VariantStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: "uppercase" | "none";
}

/**
 * Sizes are design dp. Line heights are pre-multiplied so text keeps its
 * rhythm; the <Text> component caps accessibility scaling separately so large
 * system font sizes reflow rather than clip.
 */
export const typography: Record<TypographyVariant, VariantStyle> = {
  display: { fontFamily: fontFamily.headingBold, fontSize: 34, lineHeight: 40 },
  h1: { fontFamily: fontFamily.headingBold, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: fontFamily.heading, fontSize: 18, lineHeight: 24 },
  title: { fontFamily: fontFamily.bodyBold, fontSize: 16, lineHeight: 22 },
  subtitle: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyLarge: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 19 },
  caption: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  overline: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  button: {
    fontFamily: fontFamily.heading,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
};

/** Upper bound on OS font scaling so very large settings reflow, not break. */
export const MAX_FONT_SCALE = 1.4;
