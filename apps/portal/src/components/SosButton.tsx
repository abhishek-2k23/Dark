import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Icon, Text } from "@/components/ui";
import { useEmergencyStore } from "@/stores/emergencyStore";

const RED = "#DC2626";

/**
 * The deliberate way into the panic alarm, for people who can't or won't shake
 * the phone. Goes through the same countdown sheet as the shake, so there is
 * exactly one path to a broadcast and one way to cancel it.
 */
export function SosButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const open = useEmergencyStore((s) => s.open);

  return (
    <Pressable
      onPress={() => open("manual")}
      accessibilityRole="button"
      accessibilityLabel={t("emergency.sosCta")}
      className={`flex-row items-center gap-3 rounded-3xl px-5 py-4 active:opacity-85 ${className ?? ""}`}
      style={{ backgroundColor: RED }}
    >
      <Icon name="warning" size={24} color="#fff" />
      <View className="flex-1">
        <Text variant="title" style={{ color: "#fff" }}>
          {t("emergency.sosCta")}
        </Text>
        <Text variant="caption" style={{ color: "#ffffffcc" }}>
          {t("emergency.sosHint")}
        </Text>
      </View>
    </Pressable>
  );
}
