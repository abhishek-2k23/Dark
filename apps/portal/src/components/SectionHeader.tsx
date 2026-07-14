import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Link, Text } from "./ui";

/** "SECTION TITLE ......... View All" row. */
export function SectionHeader({
  title,
  onSeeAll,
  className,
}: {
  title: string;
  onSeeAll?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <View className={`flex-row items-center justify-between ${className ?? ""}`}>
      <Text variant="label" color="secondary">
        {title}
      </Text>
      {onSeeAll && <Link label={t("common.viewAll")} size="sm" onPress={onSeeAll} />}
    </View>
  );
}
