import { useEffect, useRef } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme";

/**
 * The splash that bridges the native launch screen and the app.
 *
 * A single breath: the mark fades in, its glow swells and settles, then the
 * whole thing lifts a little and hands off. It exists to cover work we already
 * wait on (fonts, auth hydration) rather than to add ceremony — so it never
 * delays a ready app beyond one complete beat.
 */

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

const FADE_IN_MS = 350;
const GLOW_SWELL_MS = 450;
const SETTLE_MS = 300;
const HAND_OFF_MS = 260;

/**
 * One complete breath. Guaranteed even when hydration finishes instantly.
 *
 * "Only animate while loading is pending" on its own means a fast device shows
 * a half-drawn frame and cuts, which reads as a glitch rather than a splash.
 * Derived from the phases above so retiming one cannot leave this stale.
 */
const MIN_BEAT_MS = FADE_IN_MS + GLOW_SWELL_MS + SETTLE_MS;

export function AnimatedSplash({
  loading,
  onDone,
}: {
  /** Still hydrating. The splash holds past its beat while this is true. */
  loading: boolean;
  onDone: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();

  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(0.92);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.7);
  const veil = useSharedValue(1);
  const mountedAt = useRef(Date.now());

  // The beat runs once on mount, independent of `loading` — otherwise a fast
  // hydration cuts it mid-swell.
  useEffect(() => {
    markOpacity.value = withTiming(1, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.cubic),
    });
    markScale.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS + GLOW_SWELL_MS, easing: Easing.out(Easing.cubic) }),
      // A touch past 1 on the way out, so the hand-off feels like a lift
      // rather than a cut.
      withDelay(0, withTiming(1.04, { duration: SETTLE_MS, easing: Easing.inOut(Easing.quad) })),
    );

    // The breath itself: in, then partly out, so it settles rather than
    // strobing back to nothing.
    glowOpacity.value = withDelay(
      FADE_IN_MS - 120,
      withSequence(
        withTiming(1, { duration: GLOW_SWELL_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: SETTLE_MS, easing: Easing.inOut(Easing.sin) }),
      ),
    );
    glowScale.value = withDelay(
      FADE_IN_MS - 120,
      withTiming(1.15, { duration: GLOW_SWELL_MS + SETTLE_MS, easing: Easing.out(Easing.quad) }),
    );
  }, [markOpacity, markScale, glowOpacity, glowScale]);

  // Exit once BOTH the beat has completed and loading has finished — whichever
  // is later. On a slow start this waits; on a fast one it still shows a whole
  // breath.
  useEffect(() => {
    if (loading) return;
    // Time already spent counts toward the beat. Without this, a slow start
    // that outlasts the animation would then wait a *second* full beat before
    // handing off — the opposite of "never add wait".
    const remaining = Math.max(0, MIN_BEAT_MS - (Date.now() - mountedAt.current));
    const timer = setTimeout(() => {
      veil.value = withTiming(
        0,
        { duration: HAND_OFF_MS, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        },
      );
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading, onDone, veil]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  // Matches the native splash background exactly in dark, so the handoff from
  // the OS launch screen to this one is invisible.
  const background = scheme === "dark" ? "#050508" : colors.background;
  const glowSize = Math.min(width, height) * 0.9;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: background }, veilStyle]}
      pointerEvents="none"
    >
      <View style={styles.center}>
        {/* A real radial falloff rather than a stack of translucent circles —
            SVG gradients are GPU-cheap and avoid visible banding on OLED. */}
        <Animated.View style={[styles.glow, { width: glowSize, height: glowSize }, glowStyle]}>
          <AnimatedSvg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
                {/* The mark's own gradient endpoints, so the glow reads as
                    light coming off the logo rather than a coloured disc. */}
                <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.55" />
                <Stop offset="45%" stopColor={colors.primary} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#splashGlow)" />
          </AnimatedSvg>
        </Animated.View>

        <Animated.View style={markStyle}>
          <Image
            source={require("../../assets/images/splash-icon.png")}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", alignItems: "center", justifyContent: "center" },
  mark: { width: 160, height: 160 },
});
