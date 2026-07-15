import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme";
import { cn } from "@/utils/cn";

export interface SkeletonProps {
  /** Corner radius of the placeholder block. */
  radius?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A shimmering placeholder block: glass-tinted base with a soft light band
 * sweeping across it (core RN Animated, native driver). Size it with
 * className/style; compose blocks into per-screen skeleton layouts.
 */
export function Skeleton({ radius = 10, className, style }: SkeletonProps) {
  const { colors, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const bandWidth = Math.max(width * 0.6, 40);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, width + bandWidth],
  });

  const sheen =
    scheme === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.85)";

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className={cn("overflow-hidden", className)}
      style={[
        {
          backgroundColor: colors.glassFill,
          borderRadius: radius,
        },
        style,
      ]}
    >
      {width > 0 && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={["transparent", sheen, "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ width: bandWidth, height: "100%" }}
          />
        </Animated.View>
      )}
    </View>
  );
}
