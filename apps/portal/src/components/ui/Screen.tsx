import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useContext, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
} from "react-native";
import {
  SafeAreaView,
  type Edge,
} from "react-native-safe-area-context";

import { cn } from "@/utils/cn";
import {
  AuroraBackground,
  type AuroraVariant,
} from "./AuroraBackground";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a vertical ScrollView. */
  scroll?: boolean;
  /** Apply default horizontal padding. */
  padded?: boolean;
  /** Safe-area edges to inset. Defaults to top + bottom. */
  edges?: Edge[];
  /** Ambient glow backdrop preset; "none" renders a flat background. */
  aurora?: AuroraVariant | "none";
  /**
   * Lift content clear of the on-screen keyboard. On by default so no form ends
   * up hidden behind it; opt out for screens that manage the keyboard
   * themselves. No-op on screens without a focused input.
   */
  avoidKeyboard?: boolean;
  className?: string;
  contentClassName?: string;
  scrollProps?: ScrollViewProps;
}

/**
 * The base screen wrapper: theme background + ambient aurora glow + safe-area
 * insets. Inside a tab navigator it automatically pads content clear of the
 * floating glass tab bar. Set `scroll` for scrollable content, `padded` for
 * standard gutters.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ["top", "bottom"],
  aurora = "default",
  avoidKeyboard = true,
  className,
  contentClassName,
  scrollProps,
}: ScreenProps) {
  const padClass = padded ? "px-5" : undefined;

  // Provided by the tab navigator (measured height of the floating bar,
  // including its bottom offset); undefined on pushed/stack screens.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insideTabs = tabBarHeight !== undefined;

  // The floating bar already spans the bottom inset — avoid double padding.
  const effectiveEdges = insideTabs
    ? edges.filter((e) => e !== "bottom")
    : edges;
  const bottomClearance = insideTabs ? (tabBarHeight ?? 0) + 8 : undefined;

  const body = (
    <SafeAreaView edges={effectiveEdges} className="flex-1">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={cn("grow", padClass, contentClassName)}
          contentContainerStyle={{ paddingBottom: bottomClearance }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          className={cn("flex-1", padClass, contentClassName)}
          style={{ paddingBottom: bottomClearance }}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );

  return (
    <View className={cn("flex-1 bg-background", className)}>
      {aurora !== "none" && <AuroraBackground variant={aurora} />}
      {avoidKeyboard ? (
        // padding on iOS; Android leans on the window's native adjustResize.
        // Matches the login screen's handling so keyboard behaviour is uniform.
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}
