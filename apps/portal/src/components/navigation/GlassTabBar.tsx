import { BlurView } from "expo-blur";
// Deep import on purpose: expo-router vendors react-navigation, so pulling
// bottom-tabs from anywhere else would create a second (mismatched) copy of
// the height contexts the navigator provides.
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "expo-router/build/react-navigation/bottom-tabs";
import { useContext } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { tabBar as geometry, useTheme } from "@/theme";

/**
 * Flip to true if real-time blur proves too expensive on low-end Android —
 * the bar falls back to a near-opaque fill that reads almost identically.
 */
const DISABLE_BLUR = false;

/**
 * Docked glass tab bar shared by all role layouts. One of the few places
 * that uses a real BlurView — content scrolling underneath is what sells the
 * glass; everywhere else fakes it with translucent fills. Active tab is
 * indicated by color alone.
 */
export function GlassTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  const dark = scheme === "dark";
  const overlay = dark ? "rgba(13,13,20,0.9)" : "rgba(255,255,255,0.88)";

  return (
    <View
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: colors.glassBorder,
        overflow: "hidden",
      }}
    >
      {DISABLE_BLUR ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: dark
                ? "rgba(13,13,20,0.96)"
                : "rgba(255,255,255,0.96)",
            },
          ]}
        />
      ) : (
        <>
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={40}
            tint={dark ? "dark" : "light"}
            experimentalBlurMethod={
              Platform.OS === "android" ? "dimezisBlurView" : "none"
            }
          />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]}
          />
        </>
      )}

      <View
        className="flex-row items-center"
        style={{ height: geometry.height }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label =
            options.title !== undefined ? options.title : route.name;
          const color = focused ? colors.primary : colors.contentTertiary;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              className="flex-1 items-center justify-center gap-1"
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text
                variant="overline"
                numberOfLines={1}
                style={{ color, fontSize: 10, letterSpacing: 0.2 }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
