import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Reanimated, {
  cancelAnimation,
  Easing as ReEasing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { useAnimationsActive } from "@/hooks/useAnimationsActive";
import { useTheme } from "@/theme";

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

export type AuroraVariant = "default" | "hero" | "subtle";

export interface AuroraBackgroundProps {
  /** Blob layout preset. `hero` is larger/brighter for marketing-ish screens. */
  variant?: AuroraVariant;
  /** Override the blob colors (raw color strings; defaults to `colors.aurora`). */
  hues?: string[];
  /** Render only the first N blobs of the preset (e.g. 1 for a lone glow). */
  count?: number;
  /** Fully custom free-roaming blob specs; overrides the `variant` preset
   *  (which still picks the intensity). */
  specs?: BlobSpec[];
  width?: number;
  height?: number;
}

/** A free-roaming blob. Both the built-in presets and custom `specs` are these. */
export interface BlobSpec {
  /** Blob diameter as a fraction of screen width. */
  size: number;
  travelX: number;
  travelY: number;
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
   * the bounds width (positive = right).
   */
  offsetX?: number;
  /**
   * Shifts the blob's rest position from the bounds' center, as a fraction of
   * the bounds height (positive = down). Lets a blob sit low in a clipped
   * strip so its falloff reaches zero before the strip's top edge — otherwise
   * the clip cuts the glow into a visible straight line.
   */
  offsetY?: number;
}

const PRESETS: Record<AuroraVariant, BlobSpec[]> = {
  default: [
    {
      size: 0.62,
      travelX: 0.7,
      travelY: 0.58,
      offsetX: -0.18,
      offsetY: -0.22,
      xMs: 9_000,
      yMs: 12_500,
      breatheMs: 4_200,
      breatheScale: 0.14,
    },
    {
      size: 0.68,
      travelX: 0.78,
      travelY: 0.64,
      offsetX: 0.2,
      offsetY: -0.04,
      xMs: 11_500,
      yMs: 9_800,
      flipX: true,
      breatheMs: 5_100,
      breatheScale: 0.14,
    },
    {
      size: 0.56,
      travelX: 0.66,
      travelY: 0.72,
      offsetX: -0.04,
      offsetY: 0.24,
      xMs: 13_000,
      yMs: 15_500,
      flipY: true,
      breatheMs: 3_500,
      breatheScale: 0.12,
    },
  ],
  hero: [
    {
      size: 0.68,
      travelX: 0.78,
      travelY: 0.62,
      offsetX: -0.2,
      offsetY: -0.24,
      xMs: 6_500,
      yMs: 9_000,
      breatheMs: 3_300,
      breatheScale: 0.18,
    },
    {
      size: 0.74,
      travelX: 0.86,
      travelY: 0.7,
      offsetX: 0.22,
      offsetY: -0.02,
      xMs: 8_200,
      yMs: 7_000,
      flipX: true,
      breatheMs: 4_100,
      breatheScale: 0.2,
    },
    {
      size: 0.6,
      travelX: 0.72,
      travelY: 0.8,
      offsetX: -0.03,
      offsetY: 0.26,
      xMs: 9_400,
      yMs: 11_000,
      flipY: true,
      breatheMs: 2_800,
      breatheScale: 0.16,
    },
  ],
  subtle: [
    {
      size: 0.5,
      travelX: 0.58,
      travelY: 0.48,
      offsetX: -0.16,
      offsetY: -0.2,
      xMs: 13_000,
      yMs: 17_500,
      breatheMs: 6_500,
      breatheScale: 0.1,
    },
    {
      size: 0.56,
      travelX: 0.64,
      travelY: 0.54,
      offsetX: 0.18,
      offsetY: -0.03,
      xMs: 16_000,
      yMs: 13_500,
      flipX: true,
      breatheMs: 7_800,
      breatheScale: 0.1,
    },
    {
      size: 0.46,
      travelX: 0.56,
      travelY: 0.6,
      offsetX: -0.03,
      offsetY: 0.22,
      xMs: 18_500,
      yMs: 21_000,
      flipY: true,
      breatheMs: 5_600,
      breatheScale: 0.08,
    },
  ],
};

const INTENSITY: Record<AuroraVariant, number> = {
  default: 1,
  hero: 1.3,
  subtle: 0.6,
};


const FALLOFF: { offset: string; alpha: number }[] = [
  { offset: "0%", alpha: 1 },
  { offset: "35%", alpha: 0.8 },
  { offset: "55%", alpha: 0.5 },
  { offset: "72%", alpha: 0.25 },
  { offset: "86%", alpha: 0.08 },
  { offset: "100%", alpha: 0 },
];

const LOBES = 7;


const MORPH_PERIOD_RATIO = 2.7;


const MORPH_DEPTH = 0.2;
const HARMONICS: { freq: number; amp: number }[] = [
  { freq: 1, amp: 0.5 },
  { freq: 2, amp: 0.26 },
  { freq: 3, amp: 0.14 },
  { freq: 5, amp: 0.1 },
];

function canvasFor(diameter: number): number {
  return diameter * (1 + MORPH_DEPTH);
}
function buildBlobPath(
  t: number,
  seed: number,
  radius: number,
  depth: number,
  center: number,
): string {
  "worklet";
  const xs: number[] = [];
  const ys: number[] = [];
  const phase = 2 * Math.PI * t;

  for (let i = 0; i < LOBES; i++) {
    let n = 0;
    for (let h = 0; h < HARMONICS.length; h++) {
      const { freq, amp } = HARMONICS[h]!;
      // Each lobe and each blob gets its own offset, so no two lobes pulse
      // together and no two blobs share a silhouette.
      n += amp * Math.sin(freq * phase + seed * (h + 1.3) + i * (1.9 + h * 0.7));
    }
    const r = radius * (1 + depth * n);
    const a = (i / LOBES) * 2 * Math.PI;
    xs.push(center + r * Math.cos(a));
    ys.push(center + r * Math.sin(a));
  }

  let d = `M${xs[0]!.toFixed(2)},${ys[0]!.toFixed(2)}`;
  for (let i = 0; i < LOBES; i++) {
    const i0 = (i - 1 + LOBES) % LOBES;
    const i1 = i;
    const i2 = (i + 1) % LOBES;
    const i3 = (i + 2) % LOBES;
    // Catmull-Rom → Bézier: the 1/6 factor is what makes the tangents continuous
    // across each join.
    const c1x = xs[i1]! + (xs[i2]! - xs[i0]!) / 6;
    const c1y = ys[i1]! + (ys[i2]! - ys[i0]!) / 6;
    const c2x = xs[i2]! - (xs[i3]! - xs[i1]!) / 6;
    const c2y = ys[i2]! - (ys[i3]! - ys[i1]!) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${xs[i2]!.toFixed(2)},${ys[i2]!.toFixed(2)}`;
  }
  return `${d}Z`;
}
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
function GlowBlob({
  diameter,
  color,
  opacity,
  id,
  seed,
  morphMs,
  paused,
}: {
  diameter: number;
  color: string;
  opacity: number;
  id: string;
  seed: number;
  morphMs: number;
  paused: boolean;
}) {
  const t = useSharedValue(0);
  const radius = diameter / 2;
  const canvas = canvasFor(diameter);

  useEffect(() => {
    if (paused) {
      cancelAnimation(t);
      // Frozen at phase 0 — still an amoeba, just a still one.
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      // Linear: the harmonics supply the character, so easing here would only
      // make the whole shape surge and stall once per loop.
      withTiming(1, { duration: morphMs, easing: ReEasing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t, morphMs, paused]);

  const animatedProps = useAnimatedProps(() => ({
    d: buildBlobPath(t.value, seed, radius, MORPH_DEPTH, canvas / 2),
  }));

  return (
    <Svg width={canvas} height={canvas}>
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
      <AnimatedPath animatedProps={animatedProps} fill={`url(#${id})`} />
    </Svg>
  );
}

function DriftingBlob({
  spec,
  color,
  opacity,
  screenW,
  screenH,
  id,
  seed,
  paused,
}: {
  spec: BlobSpec;
  color: string;
  opacity: number;
  screenW: number;
  screenH: number;
  id: string;
  seed: number;
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
  // Positioned on the padded canvas, so the blob's centre still lands on its
  // anchor rather than being nudged by the morph padding.
  const canvas = canvasFor(diameter);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: (screenW - canvas) / 2 + (spec.offsetX ?? 0) * screenW,
        top: (screenH - canvas) / 2 + (spec.offsetY ?? 0) * screenH,
        width: canvas,
        height: canvas,
        opacity: glow,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <GlowBlob
        diameter={diameter}
        color={color}
        opacity={opacity}
        id={id}
        seed={seed}
        morphMs={spec.breatheMs * MORPH_PERIOD_RATIO}
        paused={paused}
      />
    </Animated.View>
  );
}

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
  // Backgrounded, buried under another route, or Reduce Motion — in all three
  // the blobs freeze where they are rather than burning frames unseen.
  const paused = !useAnimationsActive();
  const width = boundsW ?? windowW;
  const height = boundsH ?? windowH;

  // Presets and custom specs are the same kind of thing now, so there is one
  // render path rather than a formation branch and a free-roaming branch.
  const blobs = (specs ?? PRESETS[variant]).slice(
    0,
    count ?? (specs ?? PRESETS[variant]).length,
  );

  const blobColors = hues?.length ? hues : colors.aurora;

  const baseOpacity = (scheme === "dark" ? 0.18 : 0.22) * INTENSITY[variant];

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
          seed={i * 2.4}
          paused={paused}
        />
      ))}
    </View>
  );
});
