import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/ui";
import { useTheme } from "@/theme";
import { LOGO_OUTLINE, LOGO_VIEWBOX } from "./logoPath";

/**
 * The splash that bridges the native launch screen and the app.
 *
 * The mark is built rather than shown: its outline draws itself on, then the
 * gradient artwork fills in behind the completed stroke. The outline is the
 * real brand geometry — traced from the logo bitmap's alpha channel, not
 * redrawn — so the drawn shape and the filled artwork line up exactly.
 *
 * The whole build is under three seconds and runs in the foreground while auth
 * hydration happens behind it. Neither gates the other. Copy appears only once
 * the build has finished AND there is still something to wait for.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);

// --- Build phases (must total under 3s) -------------------------------------
const RISE_MS = 320; // container scales and fades in
const DRAW_MS = 1350; // outline strokes itself on
const FILL_MS = 620; // gradient artwork fades in behind it
const SETTLE_MS = 300; // stroke recedes, mark rests
const BUILD_MS = RISE_MS + DRAW_MS + FILL_MS + SETTLE_MS; // 2590ms

const HAND_OFF_MS = 280;

/** Generous over-estimate of the outline length; exactness is not required, it
 *  only has to exceed the true length so the dash fully hides the stroke. */
const STROKE_LEN = 6000;

const LINE_HOLD_MS = 1900;
const LINE_ENTER_MS = 380;

/** Fisher–Yates. A fixed order would make the first line feel like a title. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function SplashLine({ text }: { text: string }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: LINE_ENTER_MS, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, {
      duration: LINE_ENTER_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text variant="bodySmall" color="secondary" style={styles.line}>
        {text}
      </Text>
    </Animated.View>
  );
}

export function AnimatedSplash({
  loading,
  onDone,
}: {
  /** Still hydrating. The splash holds past the build while this is true. */
  loading: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();

  const iconSize = Math.min(Math.min(width, height) * 0.56, 320);

  const containerOpacity = useSharedValue(0);
  const containerScale = useSharedValue(0.86);
  const dash = useSharedValue(STROKE_LEN); // full offset = nothing drawn
  const strokeOpacity = useSharedValue(0);
  const artOpacity = useSharedValue(0);
  const veil = useSharedValue(1);

  const mountedAt = useRef(Date.now());
  const [buildDone, setBuildDone] = useState(false);

  const lines = useMemo(() => {
    const raw = t("splash.lines", { returnObjects: true });
    return shuffle(Array.isArray(raw) ? (raw as string[]) : []);
  }, [t]);
  const [lineIndex, setLineIndex] = useState(0);

  // The build runs start to finish regardless of how fast the network
  // resolves — interrupting it halfway looks like a glitch.
  useEffect(() => {
    containerOpacity.value = withTiming(1, {
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
    });
    containerScale.value = withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) });

    strokeOpacity.value = withTiming(1, { duration: RISE_MS });
    // The draw itself: the dash offset unwinds, so the outline appears to be
    // traced rather than faded in.
    dash.value = withDelay(
      RISE_MS,
      withTiming(0, { duration: DRAW_MS, easing: Easing.inOut(Easing.cubic) }),
    );

    // Artwork arrives once the outline is closed, so the mark reads as being
    // filled in rather than cross-fading over a half-drawn shape.
    artOpacity.value = withDelay(
      RISE_MS + DRAW_MS,
      withTiming(1, { duration: FILL_MS, easing: Easing.out(Easing.quad) }),
    );
    // …and the stroke recedes once the fill carries the shape.
    strokeOpacity.value = withDelay(
      RISE_MS + DRAW_MS + FILL_MS * 0.6,
      withTiming(0, { duration: SETTLE_MS + FILL_MS * 0.4, easing: Easing.inOut(Easing.quad) }),
    );

    const timer = setTimeout(() => setBuildDone(true), BUILD_MS);
    return () => clearTimeout(timer);
  }, [containerOpacity, containerScale, dash, strokeOpacity, artOpacity]);

  const showLines = buildDone && loading && lines.length > 0;

  useEffect(() => {
    if (!showLines || lines.length < 2) return;
    const id = setInterval(() => setLineIndex((i) => (i + 1) % lines.length), LINE_HOLD_MS);
    return () => clearInterval(id);
  }, [showLines, lines.length]);

  const finish = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    if (loading) return;
    // Elapsed time counts toward the build, so a slow start hands off
    // immediately rather than waiting out a second one.
    const remaining = Math.max(0, BUILD_MS - (Date.now() - mountedAt.current));
    const timer = setTimeout(() => {
      veil.value = withTiming(
        0,
        { duration: HAND_OFF_MS, easing: Easing.in(Easing.quad) },
        (done) => {
          if (done) runOnJS(finish)();
        },
      );
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading, finish, veil]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));
  const artStyle = useAnimatedStyle(() => ({ opacity: artOpacity.value }));
  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: dash.value,
    strokeOpacity: strokeOpacity.value,
  }));

  // Matches the native splash background exactly in dark, so the hand-off from
  // the OS launch screen to this one is invisible.
  const background = scheme === "dark" ? "#050508" : colors.background;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: background }, veilStyle]}
      pointerEvents="none"
    >
      <View style={styles.center}>
        <Animated.View style={[{ width: iconSize, height: iconSize }, containerStyle]}>
          {/* Artwork sits under the stroke so the outline stays crisp while it
              draws, then takes over as the stroke recedes. */}
          <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>
            <Image
              source={require("../../assets/images/splash-icon.png")}
              style={{ width: iconSize, height: iconSize }}
              resizeMode="contain"
            />
          </Animated.View>

          <Svg
            width={iconSize}
            height={iconSize}
            viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
            style={StyleSheet.absoluteFill}
          >
            <AnimatedPath
              d={LOGO_OUTLINE}
              fill="none"
              stroke={colors.primary}
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={STROKE_LEN}
              animatedProps={pathProps}
            />
          </Svg>
        </Animated.View>

        {/* Fixed height so the copy appearing cannot shift the mark. */}
        <View style={styles.lineSlot}>
          {showLines && <SplashLine key={lineIndex} text={lines[lineIndex % lines.length]!} />}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lineSlot: {
    height: 44,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  line: { textAlign: "center" },
});
