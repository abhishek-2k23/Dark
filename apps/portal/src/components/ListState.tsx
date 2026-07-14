import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";
import { Button, IconCircle, Text, type IconName } from "./ui";

/** Centered spinner for initial loads. */
export function Loading({ className = "py-16" }: { className?: string }) {
  const { colors } = useTheme();
  return (
    <View className={`items-center justify-center ${className}`}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Friendly empty state with an icon and message. */
export function EmptyState({
  icon = "file-tray-outline",
  title,
  body,
  className = "py-12",
}: {
  icon?: IconName;
  title: string;
  body?: string;
  className?: string;
}) {
  return (
    <View className={`items-center justify-center gap-3 px-8 ${className}`}>
      <IconCircle name={icon} tone="neutral" size={56} />
      <View className="items-center gap-1">
        <Text variant="title" align="center">
          {title}
        </Text>
        {body && (
          <Text variant="bodySmall" color="secondary" align="center">
            {body}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Error state with a retry button. */
export function ErrorState({
  message,
  onRetry,
  className = "py-12",
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <View className={`items-center justify-center gap-3 px-8 ${className}`}>
      <IconCircle name="cloud-offline-outline" tone="danger" size={56} />
      <Text variant="bodySmall" color="secondary" align="center">
        {message ?? t("common.loadFailed")}
      </Text>
      {onRetry && (
        <Button
          label={t("common.retry")}
          variant="outline"
          size="sm"
          onPress={onRetry}
        />
      )}
    </View>
  );
}
