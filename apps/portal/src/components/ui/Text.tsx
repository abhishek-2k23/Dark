import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import {
  MAX_FONT_SCALE,
  typography,
  type TypographyVariant,
} from "@/theme";
import { cn } from "@/utils/cn";

/** Semantic text colors, mapped to NativeWind classes (theme-aware). */
export type TextColor =
  | "content"
  | "secondary"
  | "tertiary"
  | "inverse"
  | "primary"
  | "primaryStrong"
  | "success"
  | "danger"
  | "warning"
  | "accent"
  | "onPrimary";

const COLOR_CLASS: Record<TextColor, string> = {
  content: "text-content",
  secondary: "text-content-secondary",
  tertiary: "text-content-tertiary",
  inverse: "text-content-inverse",
  primary: "text-primary",
  primaryStrong: "text-primary-strong",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent-strong",
  onPrimary: "text-primary-on",
};

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  /** Text alignment shortcut. */
  align?: "auto" | "left" | "center" | "right";
  className?: string;
}

/**
 * The single text primitive for the app.
 *
 * - Applies a type-scale `variant` (family / size / line-height / tracking).
 * - Colors come from theme tokens so they follow light/dark automatically.
 * - Caps OS font scaling at `MAX_FONT_SCALE` so accessibility sizes reflow
 *   inside flexible layouts rather than clipping or blowing them apart.
 */
export function Text({
  variant = "body",
  color = "content",
  align,
  className,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TextProps) {
  const v = typography[variant];
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={cn(COLOR_CLASS[color], className)}
      style={[
        {
          fontFamily: v.fontFamily,
          fontSize: v.fontSize,
          lineHeight: v.lineHeight,
          letterSpacing: v.letterSpacing,
          textTransform: v.textTransform,
          textAlign: align,
        },
        style,
      ]}
      {...rest}
    />
  );
}
