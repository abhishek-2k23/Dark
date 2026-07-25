import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Pressable } from "react-native";

import { Icon } from "@/components/ui";
import { useEmergencyStore } from "@/stores/emergencyStore";
import { useUIStore } from "@/stores/uiStore";

const RED = "#DC2626";

/** Longest gap between the two taps that still counts as one double-click. */
const DOUBLE_TAP_MS = 300;

/**
 * The deliberate way into the panic alarm, for people who can't or won't shake
 * the phone. Goes through the same countdown sheet as the shake, so there is
 * exactly one path to a broadcast and one way to cancel it.
 *
 * **Takes a double-click** — two taps inside {@link DOUBLE_TAP_MS}. It sits in
 * a dashboard header a thumb travels across all day, and one stray brush should
 * not put a countdown on screen. A single tap does nothing but raise a toast
 * saying how to continue; the pending timer *is* the "waiting for the second
 * tap" state, which is why the toast only appears once the window has closed
 * without one — otherwise a successful double-click would leave a stray
 * instruction floating over the countdown it just started.
 *
 * Sized and shaped to sit beside the notification bell. Solid red rather than
 * the neighbouring glass treatment: this is the one control that must be
 * findable without reading, and it should never be mistaken for the bell next
 * to it in a hurry.
 */
export function SosButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const open = useEmergencyStore((s) => s.open);
  const showToast = useUIStore((s) => s.showToast);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (alive) setScreenReader(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      alive = false;
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onPress = () => {
    /**
     * VoiceOver and TalkBack spend their own double-tap on activating the
     * focused element, so two activations can never land 200ms apart — the
     * gesture would lock these users out of the panic button entirely. They
     * don't need the guard anyway: reaching this control means deliberately
     * focusing it first, which no stray brush does.
     */
    if (screenReader) {
      open("manual");
      return;
    }

    // A timer in flight means this is the second tap of a double-click.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      open("manual");
      return;
    }

    // Confirms the tap landed even if the toast is missed — in an emergency the
    // phone may not be in view.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timer.current = setTimeout(() => {
      timer.current = null;
      showToast(t("emergency.sosTapAgain"), "info");
    }, DOUBLE_TAP_MS);
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t("emergency.sosCta")}
      accessibilityHint={t("emergency.sosA11yHint")}
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-85 ${
        className ?? ""
      }`}
      style={{ backgroundColor: RED }}
    >
      <Icon name="warning" size={22} color="#fff" />
    </Pressable>
  );
}
