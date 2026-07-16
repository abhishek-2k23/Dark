import { memo, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { useTheme } from "@/theme";

export type AuroraVariant = "default" | "hero" | "subtle";

export interface AuroraBackgroundProps {
  /** Blob layout preset. `hero` is larger/brighter for marketing-ish screens. */
  variant?: AuroraVariant;
  /** Override the blob colors (raw color strings; defaults to `colors.aurora`). */
  hues?: string[];
  /** Render only the first N blobs of the preset (e.g. 1 for a lone glow). */
  count?: number;
  /** Fully custom blob specs; overrides the `variant` preset (which still
   *  picks the intensity). */
  specs?: BlobSpec[];
  /**
   * Coordinate space the blobs roam, defaulting to the window. Pass these when
   * the aurora fills a clipped sub-region (like the bottom strip of the login
   * screen) so the blobs wander that region instead of a mostly-offscreen one.
   */
  width?: number;
  height?: number;
}

export interface BlobSpec {
  /** Blob diameter as a fraction of screen width. Well over 1 — these are
   *  wide, soft clouds, not discs. */
  size: number;
  /** How far the blob roams, as a fraction of screen width/height. At 1 its
   *  center travels the full span, edge to edge. */
  travelX: number;
  travelY: number;
  /** Independent periods for the two axes. Because they don't divide evenly,
   *  the blob traces an open Lissajous path that keeps landing somewhere new
   *  instead of retracing a loop. */
  xMs: number;
  yMs: number;
  /** Start an axis at the far end, so this blob runs against the others on it
   *  rather than drifting in convoy. */
  flipX?: boolean;
  flipY?: boolean;
  /** Time for one breathe half-cycle (swell or shrink). */
  breatheMs: number;
  /** Peak-to-trough scale swing, e.g. 0.2 → scales between 0.9x and 1.1x. */
  breatheScale: number;
  /**
   * Shifts the blob's rest position from the bounds' center, as a fraction of
   * the bounds height (positive = down). Lets a blob sit low in a clipped
   * strip so its falloff reaches zero before the strip's top edge — otherwise
   * the clip cuts the glow into a visible straight line.
   */
  offsetY?: number;
}

/**
 * Each blob roams the entire screen on its own clock rather than orbiting a
 * fixed anchor — no blob owns the top, the bottom or the center, and where the
 * colors meet changes constantly. `flipX`/`flipY` deliberately set them against
 * each other: on any given axis some are travelling one way while others go the
 * other, so they cross and separate instead of sliding around in formation.
 */
const LAYOUT: Record<AuroraVariant, BlobSpec[]> = {
  default: [
    {
      size: 1.5,
      travelX: 0.9,
      travelY: 0.75,
      xMs: 9_000,
      yMs: 6_500,
      breatheMs: 5_000,
      breatheScale: 0.2,
    },
    {
      size: 1.6,
      travelX: 0.95,
      travelY: 0.8,
      xMs: 7_000,
      yMs: 11_000,
      flipX: true,
      breatheMs: 6_300,
      breatheScale: 0.24,
    },
    {
      size: 1.45,
      travelX: 0.85,
      travelY: 0.9,
      xMs: 12_000,
      yMs: 8_000,
      flipY: true,
      breatheMs: 4_100,
      breatheScale: 0.18,
    },
  ],
  hero: [
    {
      size: 1.7,
      travelX: 0.95,
      travelY: 0.85,
      xMs: 6_500,
      yMs: 4_700,
      breatheMs: 3_700,
      breatheScale: 0.26,
    },
    {
      size: 1.8,
      travelX: 1,
      travelY: 0.9,
      xMs: 5_300,
      yMs: 8_300,
      flipX: true,
      breatheMs: 4_700,
      breatheScale: 0.3,
    },
    {
      size: 1.65,
      travelX: 0.9,
      travelY: 1,
      xMs: 9_100,
      yMs: 6_100,
      flipY: true,
      breatheMs: 3_100,
      breatheScale: 0.22,
    },
  ],
  subtle: [
    {
      size: 1.35,
      travelX: 0.8,
      travelY: 0.7,
      xMs: 14_000,
      yMs: 10_500,
      breatheMs: 8_000,
      breatheScale: 0.12,
    },
    {
      size: 1.4,
      travelX: 0.85,
      travelY: 0.75,
      xMs: 11_000,
      yMs: 17_000,
      flipX: true,
      breatheMs: 9_700,
      breatheScale: 0.14,
    },
    {
      size: 1.3,
      travelX: 0.75,
      travelY: 0.8,
      xMs: 18_500,
      yMs: 13_000,
      flipY: true,
      breatheMs: 6_700,
      breatheScale: 0.1,
    },
  ],
};

const INTENSITY: Record<AuroraVariant, number> = {
  default: 1,
  hero: 1.3,
  subtle: 0.6,
};

/**
 * Radial falloff for a blob, as {offset, alpha multiplier} pairs. The many
 * closely-spaced stops approximate a gaussian: the blob fades out gradually
 * across its whole radius with no point where the ramp visibly steps, so it
 * reads as blurred rather than as a disc with a soft edge. Cheaper than a real
 * blur — it's just an SVG gradient, no render-target work.
 */
const FALLOFF: { offset: string; alpha: number }[] = [
  { offset: "0%", alpha: 1 },
  { offset: "18%", alpha: 0.78 },
  { offset: "34%", alpha: 0.54 },
  { offset: "50%", alpha: 0.33 },
  { offset: "66%", alpha: 0.17 },
  { offset: "82%", alpha: 0.06 },
  { offset: "100%", alpha: 0 },
];

/**
 * Tracks the OS "reduce motion" setting. The aurora animates forever, so it is
 * exactly the kind of ambient motion that setting exists to switch off — when
 * enabled we render the same composition, just frozen at its start pose.
 */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduce(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

/**
 * Drives a 0→1→0 oscillation. `Easing.inOut` makes each pass ease out as it
 * approaches the end and accelerate away from it — the blob decelerates into a
 * turn instead of hitting the edge and snapping back.
 */
function useOscillator(durationMs: number, paused: boolean) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (paused) {
      progress.setValue(0);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(progress, {
        toValue,
        duration: durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
        isInteraction: false,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [progress, durationMs, paused]);

  return progress;
}

/**
 * One soft glow cloud drifting across the whole screen. Position comes from two
 * independent oscillators (one per axis) rather than a single angle, which is
 * what frees it from circling a fixed point: with mismatched periods the pair
 * traces a wandering Lissajous path over the full width and height. A third
 * loop breathes it. All of it is core RN Animated on the native driver — no
 * worklets, and nothing touches the JS thread once started.
 */
function DriftingBlob({
  spec,
  color,
  opacity,
  screenW,
  screenH,
  id,
  paused,
}: {
  spec: BlobSpec;
  color: string;
  opacity: number;
  screenW: number;
  screenH: number;
  id: string;
  paused: boolean;
}) {
  const x = useOscillator(spec.xMs, paused);
  const y = useOscillator(spec.yMs, paused);
  const breathe = useOscillator(spec.breatheMs, paused);

  const ampX = (spec.travelX * screenW) / 2;
  const ampY = (spec.travelY * screenH) / 2;

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: spec.flipX ? [ampX, -ampX] : [-ampX, ampX],
  });
  const translateY = y.interpolate({
    inputRange: [0, 1],
    outputRange: spec.flipY ? [ampY, -ampY] : [-ampY, ampY],
  });
  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1 - spec.breatheScale / 2, 1 + spec.breatheScale / 2],
  });

  // Multiplies the alpha baked into the gradient stops — the cloud dims as it
  // shrinks, which sells the swell far more than scale alone does.
  const glow = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const diameter = spec.size * screenW;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: (screenW - diameter) / 2,
        top: (screenH - diameter) / 2 + (spec.offsetY ?? 0) * screenH,
        width: diameter,
        height: diameter,
        opacity: glow,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id}>
            {FALLOFF.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={color}
                stopOpacity={opacity * stop.alpha}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="50%" r="50%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Ambient colored glow behind screen content — the backdrop that makes
 * translucent glass fills read as glass without any real-time blur cost, and
 * the only source of decorative color in the app (cards are deliberately
 * neutral; see `GlassCard`).
 *
 * Three wide, blurred clouds — one per aurora color — drift across the full
 * screen on mismatched clocks and in opposing directions. Nothing is anchored,
 * so the composition never settles into a fixed arrangement and no region of
 * the screen keeps the same color for long. Rendered once per screen (inside
 * `Screen`) over the flat theme background, absolutely positioned and inert.
 */
export const AuroraBackground = memo(function AuroraBackground({
  variant = "default",
  hues,
  count,
  specs,
  width: boundsW,
  height: boundsH,
}: AuroraBackgroundProps) {
  const { colors, scheme } = useTheme();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const paused = useReduceMotion();
  const width = boundsW ?? windowW;
  const height = boundsH ?? windowH;

  const blobColors = hues?.length ? hues : colors.aurora;
  const preset = specs ?? LAYOUT[variant];
  const blobs = preset.slice(0, count ?? preset.length);

  // Higher than a hard-edged blob would need: the gaussian falloff spreads the
  // same alpha over a much wider radius, so the peak has to be brighter for the
  // cloud to register at all.
  const baseOpacity = (scheme === "dark" ? 0.34 : 0.42) * INTENSITY[variant];

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      pointerEvents="none"
    >
      {blobs.map((spec, i) => (
        <DriftingBlob
          key={`${variant}-${i}`}
          id={`aurora-${variant}-${i}`}
          spec={spec}
          color={blobColors[i % blobColors.length]!}
          opacity={baseOpacity}
          screenW={width}
          screenH={height}
          paused={paused}
        />
      ))}
    </View>
  );
});
