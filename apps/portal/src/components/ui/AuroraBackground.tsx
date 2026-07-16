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
  /** Fully custom free-roaming blob specs; overrides the `variant` preset
   *  (which still picks the intensity). */
  specs?: BlobSpec[];
  /**
   * Coordinate space the blobs roam, defaulting to the window. Pass these when
   * the aurora fills a clipped sub-region (like the bottom strip of the login
   * screen) so the blobs wander that region instead of a mostly-offscreen one.
   */
  width?: number;
  height?: number;
}

/** A free-roaming blob, used only via the `specs` prop (e.g. the login glow). */
export interface BlobSpec {
  /** Blob diameter as a fraction of screen width. */
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

/** One disc riding the rotating formation of a preset variant. */
interface OrbitBlobSpec {
  /** Disc diameter as a fraction of screen width — small circles, not clouds. */
  size: number;
  /** Distance from the formation center, as a fraction of screen width. */
  radius: number;
  /** Fixed seat on the ring, in degrees. */
  angleDeg: number;
  /** Time for one breathe half-cycle (swell or shrink). */
  breatheMs: number;
  /** Peak-to-trough scale swing, e.g. 0.2 → scales between 0.9x and 1.1x. */
  breatheScale: number;
}

interface ClusterSpec {
  /** One full revolution of the formation. */
  rotateMs: number;
  /** Formation-center drift span, as fractions of screen width/height. */
  driftX: number;
  driftY: number;
  /** Periods of the center's two drift axes (mismatched → open path). */
  xMs: number;
  yMs: number;
  blobs: OrbitBlobSpec[];
}

/**
 * The presets are rotating formations: three small discs sit 120° apart on a
 * ring, the ring spins continuously, and the formation's center wanders the
 * screen on an open Lissajous path. Every disc therefore sweeps the whole
 * screen over time — yet no two can ever meet, because their separation along
 * the ring (≥ the chord between seats, minus nothing: seats are rigid) always
 * exceeds the sum of their visible radii, breathing included. Collision-free
 * by construction, not by luck.
 */
const CLUSTERS: Record<AuroraVariant, ClusterSpec> = {
  default: {
    rotateMs: 22_000,
    driftX: 0.3,
    driftY: 0.5,
    xMs: 7_500,
    yMs: 9_500,
    blobs: [
      { size: 0.55, radius: 0.36, angleDeg: -90, breatheMs: 4_200, breatheScale: 0.14 },
      { size: 0.6, radius: 0.4, angleDeg: 30, breatheMs: 5_100, breatheScale: 0.14 },
      { size: 0.5, radius: 0.34, angleDeg: 150, breatheMs: 3_500, breatheScale: 0.12 },
    ],
  },
  hero: {
    rotateMs: 16_000,
    driftX: 0.3,
    driftY: 0.5,
    xMs: 5_500,
    yMs: 7_500,
    blobs: [
      { size: 0.6, radius: 0.38, angleDeg: -90, breatheMs: 3_300, breatheScale: 0.18 },
      { size: 0.65, radius: 0.42, angleDeg: 30, breatheMs: 4_100, breatheScale: 0.2 },
      { size: 0.55, radius: 0.36, angleDeg: 150, breatheMs: 2_800, breatheScale: 0.16 },
    ],
  },
  subtle: {
    rotateMs: 32_000,
    driftX: 0.25,
    driftY: 0.4,
    xMs: 11_000,
    yMs: 14_000,
    blobs: [
      { size: 0.45, radius: 0.34, angleDeg: -90, breatheMs: 6_500, breatheScale: 0.1 },
      { size: 0.5, radius: 0.38, angleDeg: 30, breatheMs: 7_800, breatheScale: 0.1 },
      { size: 0.42, radius: 0.32, angleDeg: 150, breatheMs: 5_600, breatheScale: 0.08 },
    ],
  },
};

const INTENSITY: Record<AuroraVariant, number> = {
  default: 1,
  hero: 1.3,
  subtle: 0.6,
};

/**
 * Radial falloff for a disc, as {offset, alpha multiplier} pairs. The core
 * holds most of the alpha and the fade is packed into the outer part of the
 * radius, so each glow reads as a small, soft-edged circle rather than a wide
 * cloud with a long shadowy skirt. Still just an SVG gradient — no blur cost.
 */
const FALLOFF: { offset: string; alpha: number }[] = [
  { offset: "0%", alpha: 1 },
  { offset: "35%", alpha: 0.8 },
  { offset: "55%", alpha: 0.5 },
  { offset: "72%", alpha: 0.25 },
  { offset: "86%", alpha: 0.08 },
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
 * Drives a continuous 0→1 loop at constant speed — one revolution per cycle.
 * The 1→0 wrap is invisible because a full turn returns the formation to an
 * identical pose.
 */
function useSpin(durationMs: number, paused: boolean) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (paused) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, durationMs, paused]);

  return progress;
}

/** The shared soft-edged disc: an SVG radial gradient, nothing else. */
function GlowDisc({
  diameter,
  color,
  opacity,
  id,
}: {
  diameter: number;
  color: string;
  opacity: number;
  id: string;
}) {
  return (
    <Svg width={diameter} height={diameter}>
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
  );
}

/**
 * One disc breathing in place at its seat on the ring. The formation's parent
 * view supplies all the travel (drift + rotation); the disc only swells and
 * dims on its own clock so the trio doesn't pulse in unison.
 */
function OrbitBlob({
  spec,
  color,
  opacity,
  screenW,
  screenH,
  id,
  paused,
}: {
  spec: OrbitBlobSpec;
  color: string;
  opacity: number;
  screenW: number;
  screenH: number;
  id: string;
  paused: boolean;
}) {
  const breathe = useOscillator(spec.breatheMs, paused);

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1 - spec.breatheScale / 2, 1 + spec.breatheScale / 2],
  });
  // Dims as it shrinks — sells the swell far more than scale alone does.
  const glow = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const diameter = spec.size * screenW;
  const angle = (spec.angleDeg * Math.PI) / 180;
  const cx = screenW / 2 + spec.radius * screenW * Math.cos(angle);
  const cy = screenH / 2 + spec.radius * screenW * Math.sin(angle);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: cx - diameter / 2,
        top: cy - diameter / 2,
        width: diameter,
        height: diameter,
        opacity: glow,
        transform: [{ scale }],
      }}
    >
      <GlowDisc diameter={diameter} color={color} opacity={opacity} id={id} />
    </Animated.View>
  );
}

/**
 * One free-roaming disc for custom `specs`. Position comes from two
 * independent oscillators (one per axis): with mismatched periods the pair
 * traces an open Lissajous path around the (optionally offset) anchor. A
 * third loop breathes it. All of it is core RN Animated on the native driver
 * — no worklets, and nothing touches the JS thread once started.
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
        left: (screenW - diameter) / 2 + (spec.offsetX ?? 0) * screenW,
        top: (screenH - diameter) / 2 + (spec.offsetY ?? 0) * screenH,
        width: diameter,
        height: diameter,
        opacity: glow,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <GlowDisc diameter={diameter} color={color} opacity={opacity} id={id} />
    </Animated.View>
  );
}

/**
 * Ambient colored glow behind screen content — the backdrop that makes
 * translucent glass fills read as glass without any real-time blur cost, and
 * the only source of decorative color in the app (cards are deliberately
 * neutral; see `GlassCard`).
 *
 * Three small soft-edged discs — one per aurora color — ride a slowly spinning
 * formation whose center wanders the whole screen, so every disc visits every
 * region without any two ever touching. Rendered once per screen (inside
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

  // Hooks must run unconditionally; when custom specs bypass the formation,
  // its three drivers are simply kept paused instead of skipped.
  const cluster = CLUSTERS[variant];
  const clusterPaused = paused || !!specs;
  const rotate = useSpin(cluster.rotateMs, clusterPaused);
  const driftXOsc = useOscillator(cluster.xMs, clusterPaused);
  const driftYOsc = useOscillator(cluster.yMs, clusterPaused);

  const blobColors = hues?.length ? hues : colors.aurora;

  // Higher than a hard-edged disc would need: the falloff still spreads the
  // alpha across the radius, so the peak has to be brighter for the glow to
  // register at all.
  const baseOpacity = (scheme === "dark" ? 0.3 : 0.36) * INTENSITY[variant];

  if (specs) {
    const blobs = specs.slice(0, count ?? specs.length);
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
  }

  const blobs = cluster.blobs.slice(0, count ?? cluster.blobs.length);
  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const ampX = (cluster.driftX * width) / 2;
  const ampY = (cluster.driftY * height) / 2;
  const translateX = driftXOsc.interpolate({
    inputRange: [0, 1],
    outputRange: [-ampX, ampX],
  });
  const translateY = driftYOsc.interpolate({
    inputRange: [0, 1],
    outputRange: [-ampY, ampY],
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      pointerEvents="none"
    >
      {/* Drift first, then spin: rotation happens about the view's own center,
          so the formation revolves around wherever the drift has carried it. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }, { translateY }, { rotate: rotation }] },
        ]}
      >
        {blobs.map((spec, i) => (
          <OrbitBlob
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
      </Animated.View>
    </View>
  );
});
