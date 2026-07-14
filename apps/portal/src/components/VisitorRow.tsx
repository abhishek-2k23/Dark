import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { visitorPurposeIcon, visitorStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";
import { Badge, Card, IconCircle, Text } from "./ui";

export interface VisitorRowData {
  id: string;
  name: string;
  purpose: string;
  status: string;
  createdAt: string;
}

/** One visitor request in a list: icon, name, purpose, time, status badge. */
export function VisitorRow({
  visitor,
  onPress,
}: {
  visitor: VisitorRowData;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress} variant="elevated" className="flex-row items-center gap-3">
      <IconCircle
        name={visitorPurposeIcon[visitor.purpose] ?? "help-circle-outline"}
        tone="primary"
        size={44}
      />
      <View className="flex-1 gap-0.5">
        <Text variant="title" numberOfLines={1}>
          {visitor.name}
        </Text>
        <Text variant="bodySmall" color="secondary" numberOfLines={1}>
          {t(`enums.visitorPurpose.${visitor.purpose}`)} ·{" "}
          {formatDateTime(visitor.createdAt)}
        </Text>
      </View>
      <Badge
        label={t(`enums.visitorStatus.${visitor.status}`)}
        tone={visitorStatusTone[visitor.status] ?? "neutral"}
        uppercase
        size="sm"
      />
    </Card>
  );
}
