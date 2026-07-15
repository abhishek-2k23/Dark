import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { useTheme, type NeonHue } from "@/theme";

export type AuroraVariant = "default" | "hero" | "subtle";

export interface AuroraBackgroundProps {
  /** Blob layout preset. `hero` is larger/brighter for marketing-ish screens. */
  variant?: AuroraVariant;
  /** Override the blob hues (defaults to the theme's aurora palette). */
  hues?: NeonHue[];
}

interface Blob {
  /** Center as percentages of the container. */
  cx: string;
  cy: string;
  r: string;
}

/** Blob geometry per variant — colors come from the theme. */
const LAYOUT: Record<AuroraVariant, Blob[]> = {
  default: [
    { cx: "12%", cy: "8%", r: "48%" },
    { cx: "95%", cy: "38%", r: "52%" },
    { cx: "20%", cy: "96%", r: "46%" },
  ],
  hero: [
    { cx: "30%", cy: "12%", r: "60%" },
    { cx: "90%", cy: "45%", r: "58%" },
    { cx: "8%", cy: "85%", r: "52%" },
  ],
  subtle: [
    { cx: "10%", cy: "5%", r: "40%" },
    { cx: "100%", cy: "70%", r: "42%" },
  ],
};

const INTENSITY: Record<AuroraVariant, number> = {
  default: 1,
  hero: 1.35,
  subtle: 0.6,
};

/**
 * Ambient colored glow blobs behind screen content — the backdrop that makes
 * translucent glass fills read as glass without any real-time blur cost.
 * Rendered once per screen (inside `Screen`), absolutely positioned and inert.
 */
export const AuroraBackground = memo(function AuroraBackground({
  variant = "default",
  hues,
}: AuroraBackgroundProps) {
  const { colors, scheme } = useTheme();

  const blobColors = hues?.length
    ? hues.map((h) => colors.neon[h])
    : colors.aurora;
  const blobs = LAYOUT[variant];
  // Light scheme blobs are pastel and sit on a bright canvas — they can run
  // stronger without overpowering content the way neon does on near-black.
  const baseOpacity = (scheme === "dark" ? 0.3 : 0.45) * INTENSITY[variant];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {blobs.map((_, i) => {
            const color = blobColors[i % blobColors.length]!;
            return (
              <RadialGradient key={i} id={`aurora-${variant}-${i}`}>
                <Stop offset="0%" stopColor={color} stopOpacity={baseOpacity} />
                <Stop
                  offset="55%"
                  stopColor={color}
                  stopOpacity={baseOpacity * 0.4}
                />
                <Stop offset="100%" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {blobs.map((b, i) => (
          <Circle
            key={i}
            cx={b.cx}
            cy={b.cy}
            r={b.r}
            fill={`url(#aurora-${variant}-${i})`}
          />
        ))}
      </Svg>
    </View>
  );
});
