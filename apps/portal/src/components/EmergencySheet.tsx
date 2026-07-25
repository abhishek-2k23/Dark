import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { Button, Icon, Text, type IconName } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import {
  useEmergencyStore,
  type EmergencyType,
} from "@/stores/emergencyStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * Seconds between the sheet opening and the alarm going out. Long enough to
 * catch a pocket-shake, short enough that a real emergency isn't waiting on it.
 */
const COUNTDOWN_SECONDS = 10;

const TYPES: { type: EmergencyType; icon: IconName }[] = [
  { type: "MEDICAL", icon: "medkit-outline" },
  { type: "FIRE", icon: "flame-outline" },
  { type: "SECURITY", icon: "shield-outline" },
  { type: "OTHER", icon: "alert-circle-outline" },
];

/** Red regardless of theme — this screen means one thing in any palette. */
const RED = "#DC2626";
const RED_DEEP = "#7F1D1D";

/**
 * The panic alarm's one interactive surface: a full-screen countdown that
 * broadcasts to the whole society unless cancelled.
 *
 * The countdown is the entire safety mechanism for shake-triggered alarms, so
 * the cancel affordance is the biggest thing on screen. Once sent, the sheet
 * switches to a confirmation with a stand-down button, because the person who
 * raised a false alarm is exactly who should be able to take it back.
 */
export function EmergencySheet() {
  const open = useEmergencyStore((s) => s.trigger !== null);
  const close = useEmergencyStore((s) => s.close);

  return (
    <Modal
      visible={open}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Mounted only while open, so every opening starts from a clean
          countdown instead of an effect reaching in to reset last time's. */}
      {open && <SosBody />}
    </Modal>
  );
}

function SosBody() {
  const { t } = useTranslation();
  const type = useEmergencyStore((s) => s.type);
  const setType = useEmergencyStore((s) => s.setType);
  const close = useEmergencyStore((s) => s.close);
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [sentId, setSentId] = useState<string | null>(null);

  const raise = trpc.emergency.raise.useMutation({
    onSuccess: (alert) => {
      setSentId(alert.id);
      void utils.emergency.invalidate();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e) => {
      showToast(e.message, "error");
      close();
    },
  });

  const resolve = trpc.emergency.resolve.useMutation({
    onSuccess: () => {
      showToast(t("emergency.standDownToast"), "success");
      void utils.emergency.invalidate();
      close();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  // The countdown runs off a deadline rather than by decrementing state, so a
  // slow render or a stalled tick shortens the interval instead of stretching
  // the wait — an alarm must never fire later than it promised.
  const fired = useRef(false);

  useEffect(() => {
    const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;
    const id = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setRemaining(left > 0 ? left : 0);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        clearInterval(id);
        // Read at fire time, not captured, so a type chosen mid-countdown wins.
        raise.mutate({ type: useEmergencyStore.getState().type });
      } else if (left > 0) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counting = sentId === null && !raise.isPending;

  return (
    <View
      className="flex-1 items-center justify-center gap-8 px-8"
      style={{ backgroundColor: sentId ? RED_DEEP : RED }}
    >
        {sentId ? (
          <>
            <Icon name="checkmark-circle" size={88} color="#fff" />
            <View className="gap-2">
              <Text variant="h1" align="center" style={{ color: "#fff" }}>
                {t("emergency.sentTitle")}
              </Text>
              <Text variant="body" align="center" style={{ color: "#ffffffdd" }}>
                {t("emergency.sentBody")}
              </Text>
            </View>
            <View className="w-full gap-3">
              <Button
                label={t("emergency.standDown")}
                variant="secondary"
                size="lg"
                loading={resolve.isPending}
                onPress={() => resolve.mutate({ emergencyId: sentId })}
                fullWidth
              />
              <Button
                label={t("common.close")}
                variant="primary"
                size="lg"
                onPress={close}
                fullWidth
              />
            </View>
          </>
        ) : (
          <>
            <View className="gap-2">
              <Text variant="h2" align="center" style={{ color: "#ffffffdd" }}>
                {t("emergency.countdownTitle")}
              </Text>
              <Text
                align="center"
                style={{ color: "#fff", fontSize: 96, lineHeight: 104, fontWeight: "700" }}
              >
                {remaining}
              </Text>
              <Text variant="body" align="center" style={{ color: "#ffffffdd" }}>
                {t("emergency.countdownBody")}
              </Text>
            </View>

            {/* Narrowing the type is optional and never interrupts the count. */}
            <View className="w-full flex-row flex-wrap justify-center gap-2">
              {TYPES.map((option) => {
                const active = option.type === type;
                return (
                  <Pressable
                    key={option.type}
                    onPress={() => setType(option.type)}
                    disabled={!counting}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="flex-row items-center gap-2 rounded-full px-4 py-2.5 active:opacity-80"
                    style={{
                      backgroundColor: active ? "#fff" : "#ffffff26",
                      borderWidth: 1,
                      borderColor: active ? "#fff" : "#ffffff59",
                    }}
                  >
                    <Icon
                      name={option.icon}
                      size={18}
                      color={active ? RED : "#fff"}
                    />
                    <Text
                      variant="subtitle"
                      style={{ color: active ? RED : "#fff" }}
                    >
                      {t(`emergency.type.${option.type}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* The safety valve. Sized and placed to be hit without looking. */}
            <Pressable
              onPress={close}
              disabled={!counting}
              accessibilityRole="button"
              accessibilityLabel={t("emergency.cancel")}
              className="w-full items-center justify-center rounded-3xl active:opacity-80"
              style={{ backgroundColor: "#fff", paddingVertical: 22 }}
            >
              <Text variant="h3" style={{ color: RED }}>
                {raise.isPending ? t("emergency.sending") : t("emergency.cancel")}
              </Text>
            </Pressable>
          </>
        )}
    </View>
  );
}
