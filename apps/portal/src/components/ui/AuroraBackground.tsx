import { LinearGradient } from "expo-linear-gradient";
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

import { useTheme, type NeonHue } from "@/theme";
import { withAlpha } from "@/utils/color";

export type AuroraVariant = "default" | "hero" | "subtle";

export interface AuroraBackgroundProps {
  /** Blob layout preset. `hero` is larger/brighter for marketing-ish screens. */
  variant?: AuroraVariant;
  /** Override the blob hues (defaults to the theme's aurora palette). */
  hues?: NeonHue[];
}

interface BlobSpec {
  /** Anchor point as a fraction of screen width/height. */
  x: number;
  y: number;
  /** Blob diameter as a fraction of screen width. */
  size: number;
  /** Radius of the drift orbit as a fraction of screen width. */
  orbit: number;
  /** Time for one full loop around the orbit. */
  durationMs: number;
  /** Initial angle (deg) so blobs never move in lockstep. */
  phaseDeg: number;
  /** Time for one breathe half-cycle (swell or shrink). */
  breatheMs: number;
  /** Peak-to-trough scale swing, e.g. 0.2 → scales between 0.9x and 1.1x. */
  breatheScale: number;
}

/**
 * Layouts are anchors + orbits — each blob slowly circles its anchor while
 * breathing on its own clock. Orbit and breathe periods are deliberately
 * non-harmonic (no shared divisor) so the blobs never resync into a visible
 * repeating pattern.
 */
const LAYOUT: Record<AuroraVariant, BlobSpec[]> = {
  default: [
    {
      x: 0.15,
      y: 0.12,
      size: 1.15,
      orbit: 0.3,
      durationMs: 23_000,
      phaseDeg: 0,
      breatheMs: 7_300,
      breatheScale: 0.18,
    },
    {
      x: 0.9,
      y: 0.45,
      size: 1.2,
      orbit: 0.34,
      durationMs: 31_000,
      phaseDeg: 120,
      breatheMs: 9_700,
      breatheScale: 0.22,
    },
    {
      x: 0.3,
      y: 0.9,
      size: 1.1,
      orbit: 0.28,
      durationMs: 27_000,
      phaseDeg: 240,
      breatheMs: 6_100,
      breatheScale: 0.15,
    },
  ],
  hero: [
    {
      x: 0.25,
      y: 0.15,
      size: 1.35,
      orbit: 0.32,
      durationMs: 19_000,
      phaseDeg: 0,
      breatheMs: 6_700,
      breatheScale: 0.24,
    },
    {
      x: 0.85,
      y: 0.5,
      size: 1.4,
      orbit: 0.36,
      durationMs: 26_000,
      phaseDeg: 120,
      breatheMs: 8_900,
      breatheScale: 0.28,
    },
    {
      x: 0.3,
      y: 0.9,
      size: 1.25,
      orbit: 0.3,
      durationMs: 22_000,
      phaseDeg: 240,
      breatheMs: 5_300,
      breatheScale: 0.2,
    },
  ],
  subtle: [
    {
      x: 0.2,
      y: 0.15,
      size: 1.0,
      orbit: 0.24,
      durationMs: 34_000,
      phaseDeg: 0,
      breatheMs: 11_000,
      breatheScale: 0.12,
    },
    {
      x: 0.85,
      y: 0.75,
      size: 1.05,
      orbit: 0.26,
      durationMs: 43_000,
      phaseDeg: 170,
      breatheMs: 13_700,
      breatheScale: 0.14,
    },
  ],
};

const INTENSITY: Record<AuroraVariant, number> = {
  default: 1,
  hero: 1.3,
  subtle: 0.6,
};

/** One full rotation of the base wash, per layer. */
const WASH_DURATION_MS: Record<AuroraVariant, number> = {
  default: 44_000,
  hero: 36_000,
  subtle: 62_000,
};

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

/** Drives a looping 0→1 Animated.Value. Returns a value pinned at 0 if paused. */
function useLoop(durationMs: number, paused: boolean, pingPong = false) {
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
        easing: pingPong ? Easing.inOut(Easing.ease) : Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
    const loop = Animated.loop(
      pingPong ? Animated.sequence([step(1), step(0)]) : step(1),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, durationMs, paused, pingPong]);

  return progress;
}

/**
 * A full-bleed linear gradient wash that slowly rotates about the screen
 * center. This is what keeps the flat theme background from reading as dead
 * black/white between the blobs: even where no blob reaches, the canvas is
 * always drifting through a color ramp. Sized to the screen diagonal so the
 * corners stay covered through a full rotation.
 */
function GradientWash({
  colorA,
  colorB,
  opacity,
  durationMs,
  reverse,
  screenW,
  screenH,
  paused,
}: {
  colorA: string;
  colorB: string;
  opacity: number;
  durationMs: number;
  /** Counter-rotate this layer so stacked washes shear against each other. */
  reverse?: boolean;
  screenW: number;
  screenH: number;
  paused: boolean;
}) {
  const progress = useLoop(durationMs, paused);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"],
  });

  const size = Math.hypot(screenW, screenH);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: (screenW - size) / 2,
        top: (screenH - size) / 2,
        width: size,
        height: size,
        transform: [{ rotate }],
      }}
    >
      <LinearGradient
        colors={[
          withAlpha(colorA, opacity),
          withAlpha(colorA, opacity * 0.25),
          "transparent",
          withAlpha(colorB, opacity * 0.35),
          withAlpha(colorB, opacity),
        ]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * One soft glow blob orbiting its anchor while breathing. The blob sits at the
 * edge of an invisible square that slowly spins (core RN Animated, native
 * driver — no worklets involved), so the blob sweeps a circle around the
 * anchor; a second, independent loop scales and fades it so the motion reads
 * as alive rather than as a rigid carousel. The "blur" is the SVG radial
 * falloff; the blob itself is just a gradient disc.
 */
function OrbitingBlob({
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
  const orbitProgress = useLoop(spec.durationMs, paused);
  const breathe = useLoop(spec.breatheMs, paused, true);

  const rotate = orbitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [`${spec.phaseDeg}deg`, `${spec.phaseDeg + 360}deg`],
  });

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1 - spec.breatheScale / 2, 1 + spec.breatheScale / 2],
  });

  // Multiplies the alpha baked into the SVG stops — the blob dims as it
  // shrinks, which sells the swell far more than scale alone does.
  const glow = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const orbitPx = spec.orbit * screenW;
  const diameter = spec.size * screenW;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: spec.x * screenW - orbitPx,
        top: spec.y * screenH - orbitPx,
        width: orbitPx * 2,
        height: orbitPx * 2,
        transform: [{ rotate }],
      }}
    >
      {/* Blob pinned to the container's top edge → orbits as it spins. */}
      <Animated.View
        style={{
          position: "absolute",
          left: orbitPx - diameter / 2,
          top: -diameter / 2,
          width: diameter,
          height: diameter,
          opacity: glow,
          transform: [{ scale }],
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id}>
              <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
              <Stop
                offset="45%"
                stopColor={color}
                stopOpacity={opacity * 0.35}
              />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Ambient colored glow blobs behind screen content — the backdrop that makes
 * translucent glass fills read as glass without any real-time blur cost.
 * A pair of counter-rotating gradient washes keeps the whole canvas in motion,
 * and each blob drifts on its own slow orbit so the colors roam the screen.
 * Rendered once per screen (inside `Screen`) over the static theme
 * background, absolutely positioned and inert.
 */
export const AuroraBackground = memo(function AuroraBackground({
  variant = "default",
  hues,
}: AuroraBackgroundProps) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const paused = useReduceMotion();

  const blobColors = hues?.length
    ? hues.map((h) => colors.neon[h])
    : colors.aurora;
  const blobs = LAYOUT[variant];
  const baseOpacity = (scheme === "dark" ? 0.26 : 0.34) * INTENSITY[variant];

  // The wash sits under the blobs and must not muddy them — it only needs to
  // be strong enough that the flat background is never truly flat.
  const washOpacity = baseOpacity * 0.5;
  const washDuration = WASH_DURATION_MS[variant];

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      pointerEvents="none"
    >
      <GradientWash
        colorA={blobColors[0]!}
        colorB={blobColors[1 % blobColors.length]!}
        opacity={washOpacity}
        durationMs={washDuration}
        screenW={width}
        screenH={height}
        paused={paused}
      />
      <GradientWash
        colorA={blobColors[2 % blobColors.length]!}
        colorB={blobColors[1 % blobColors.length]!}
        opacity={washOpacity * 0.7}
        durationMs={washDuration * 1.45}
        reverse
        screenW={width}
        screenH={height}
        paused={paused}
      />
      {blobs.map((spec, i) => (
        <OrbitingBlob
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
