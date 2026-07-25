import { NavigationContext } from "expo-router/build/react-navigation/core";
import { useContext, useEffect, useState } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";

/**
 * Whether decorative animation on this screen is worth running at all.
 *
 * Three things make it worthless, and each is a standing battery cost if
 * ignored — an idle loop still burns a frame budget every 16ms:
 *
 *  - **The app is backgrounded.** Nobody is looking.
 *  - **The screen is not the focused route.** React Navigation keeps pushed-under
 *    screens mounted, so a resident three screens deep would otherwise have four
 *    ambient backdrops animating at once, three of them invisible.
 *  - **Reduce Motion is on.** The user asked for stillness.
 *
 * Returns `true` when animation should run.
 */
export function useAnimationsActive(): boolean {
  const [foreground, setForeground] = useState(
    () => AppState.currentState === "active",
  );
  const [focused, setFocused] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  // `useNavigation()` throws outside a navigator, and a couple of root-level
  // components (the biometric gate, the error boundary) render a Screen with no
  // navigator above them. Reading the context directly yields `undefined` there
  // instead, which we treat as "always focused".
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const unfocus = navigation.addListener("blur", () => setFocused(false));
    const refocus = navigation.addListener("focus", () => setFocused(true));
    return () => {
      unfocus();
      refocus();
    };
  }, [navigation]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return foreground && focused && !reduceMotion;
}
