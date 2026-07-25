import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import { Icon } from "@/components/ui";
import { useEmergencyStore } from "@/stores/emergencyStore";

const RED = "#DC2626";

/**
 * The deliberate way into the panic alarm, for people who can't or won't shake
 * the phone. Goes through the same countdown sheet as the shake, so there is
 * exactly one path to a broadcast and one way to cancel it.
 *
 * Sized and shaped to sit beside the notification bell in a dashboard header.
 * Solid red rather than the neighbouring glass treatment: this is the one
 * control that must be findable without reading, and it should never be
 * mistaken for the bell next to it in a hurry.
 */
export function SosButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const open = useEmergencyStore((s) => s.open);

  return (
    <Pressable
      onPress={() => open("manual")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t("emergency.sosCta")}
      accessibilityHint={t("emergency.sosHint")}
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-85 ${
        className ?? ""
      }`}
      style={{ backgroundColor: RED }}
    >
      <Icon name="warning" size={22} color="#fff" />
    </Pressable>
  );
}
