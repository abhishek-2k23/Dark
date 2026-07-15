import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";
import { Button, IconCircle, Skeleton, Text, type IconName } from "./ui";

export type LoadingVariant =
  | "list"
  | "cards"
  | "dashboard"
  | "profile"
  | "detail"
  | "spinner";

/** One list-row placeholder: leading circle + two text lines. */
function RowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 py-1.5">
      <Skeleton radius={22} style={{ width: 44, height: 44 }} />
      <View className="flex-1 gap-2">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3 w-4/5" />
      </View>
    </View>
  );
}

const SKELETONS: Record<Exclude<LoadingVariant, "spinner">, () => React.JSX.Element> = {
  /** Feed/list screens: a stack of rows. */
  list: () => (
    <View className="gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </View>
  ),
  /** Stat/tile screens: 2×2 card grid. */
  cards: () => (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} radius={16} className="h-32 w-[47%]" />
      ))}
    </View>
  ),
  /** Home dashboards: greeting header, quick-action tiles, banner, rows. */
  dashboard: () => (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <Skeleton radius={22} style={{ width: 44, height: 44 }} />
        <View className="flex-1 gap-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </View>
      </View>
      <View className="flex-row justify-between">
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} className="items-center gap-2">
            <Skeleton radius={16} style={{ width: 64, height: 64 }} />
            <Skeleton className="h-2.5 w-14" />
          </View>
        ))}
      </View>
      <Skeleton radius={16} className="h-36 w-full" />
      <RowSkeleton />
      <RowSkeleton />
    </View>
  ),
  /** Profile tabs: centered avatar + name + badge, then setting rows. */
  profile: () => (
    <View className="gap-5">
      <View className="items-center gap-3 pt-2">
        <Skeleton radius={44} style={{ width: 88, height: 88 }} />
        <Skeleton className="h-5 w-40" />
        <Skeleton radius={999} className="h-6 w-28" />
      </View>
      <View className="gap-3 pt-2">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </View>
    </View>
  ),
  /** Detail screens: title, meta line, body block. */
  detail: () => (
    <View className="gap-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-2/5" />
      <Skeleton radius={16} className="mt-2 h-40 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </View>
  ),
};

/**
 * Initial-load placeholder. Renders a shimmer skeleton shaped like the screen
 * it stands in for (`variant`), so layouts don't jump when data lands.
 * `spinner` keeps the old centered ActivityIndicator for tiny surfaces.
 */
export function Loading({
  variant = "list",
  className,
}: {
  variant?: LoadingVariant;
  className?: string;
}) {
  const { colors } = useTheme();

  if (variant === "spinner") {
    return (
      <View className={`items-center justify-center ${className ?? "py-16"}`}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const Body = SKELETONS[variant];
  return (
    <View className={className ?? "py-2"}>
      <Body />
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
