import { type ReactNode } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import {
  SafeAreaView,
  type Edge,
} from "react-native-safe-area-context";

import { cn } from "@/utils/cn";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a vertical ScrollView. */
  scroll?: boolean;
  /** Apply default horizontal padding. */
  padded?: boolean;
  /** Safe-area edges to inset. Defaults to top + bottom. */
  edges?: Edge[];
  className?: string;
  contentClassName?: string;
  scrollProps?: ScrollViewProps;
}

/**
 * The base screen wrapper: fills the theme background and insets for the safe
 * area. Set `scroll` for scrollable content, `padded` for standard gutters.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ["top", "bottom"],
  className,
  contentClassName,
  scrollProps,
}: ScreenProps) {
  const padClass = padded ? "px-5" : undefined;

  return (
    <SafeAreaView edges={edges} className={cn("flex-1 bg-background", className)}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={cn("grow", padClass, contentClassName)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={cn("flex-1", padClass, contentClassName)}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
