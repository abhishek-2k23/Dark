import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { visitorPurposeIcon, visitorStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Icon name={icon} size={18} color="tertiary" />
      <Text variant="bodySmall" color="secondary" className="flex-1">
        {label}
      </Text>
      <Text variant="subtitle" numberOfLines={1} className="shrink">
        {value}
      </Text>
    </View>
  );
}

export default function GuardVisitorDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const q = trpc.visitor.get.useQuery(
    { visitorId: id ?? "" },
    {
      enabled: !!id,
      // Poll while a decision is pending so the guard sees approval promptly.
      refetchInterval: (query) =>
        query.state.data?.status === "PENDING" ? 10_000 : false,
    },
  );

  const afterAction = () => {
    void utils.visitor.get.invalidate({ visitorId: id ?? "" });
    void utils.visitor.history.invalidate();
  };
  const markEntry = trpc.visitor.markEntry.useMutation({
    onSuccess: () => {
      showToast(t("guard.entryMarked"), "success");
      afterAction();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const markExit = trpc.visitor.markExit.useMutation({
    onSuccess: () => {
      showToast(t("guard.exitMarked"), "info");
      afterAction();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const v = q.data;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("guard.visitorDetail")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : v ? (
        <>
          {/* Identity */}
          <Card className="items-center gap-3">
            {v.photoUrl ? (
              <Avatar uri={v.photoUrl} name={v.name} size={84} />
            ) : (
              <IconCircle
                name={visitorPurposeIcon[v.purpose] ?? "help-circle-outline"}
                tone="primary"
                size={84}
              />
            )}
            <View className="items-center gap-1.5">
              <Text variant="h1" align="center">
                {v.name}
              </Text>
              <Badge
                label={t(`enums.visitorStatus.${v.status}`)}
                tone={visitorStatusTone[v.status] ?? "neutral"}
                uppercase
              />
            </View>
          </Card>

          {/* Details */}
          <Card className="gap-3">
            <InfoRow
              icon="home-outline"
              label={t("guard.targetFlat")}
              value={t("guard.flatLine", { tower: v.towerName, flat: v.flatNumber })}
            />
            <Divider />
            <InfoRow
              icon="pricetag-outline"
              label={t("visitors.purpose")}
              value={t(`enums.visitorPurpose.${v.purpose}`)}
            />
            <Divider />
            <InfoRow icon="call-outline" label={t("visitors.phone")} value={v.phone} />
            {v.vehicleNumber && (
              <>
                <Divider />
                <InfoRow
                  icon="car-outline"
                  label={t("visitors.vehicle")}
                  value={v.vehicleNumber}
                />
              </>
            )}
            <Divider />
            <InfoRow
              icon="time-outline"
              label={t("visitors.registeredBy")}
              value={formatDateTime(v.createdAt)}
            />
            {v.entryTime && (
              <>
                <Divider />
                <InfoRow
                  icon="enter-outline"
                  label={t("visitors.entry")}
                  value={formatDateTime(v.entryTime)}
                />
              </>
            )}
            {v.exitTime && (
              <>
                <Divider />
                <InfoRow
                  icon="exit-outline"
                  label={t("visitors.exit")}
                  value={formatDateTime(v.exitTime)}
                />
              </>
            )}
            {v.actionedByResident && (
              <>
                <Divider />
                <InfoRow
                  icon="person-outline"
                  label={t("visitors.actionedBy")}
                  value={v.actionedByResident.name}
                />
              </>
            )}
          </Card>

          {/* State-driven action */}
          {v.status === "PENDING" && (
            <Card variant="filled" className="flex-row items-center gap-3">
              <IconCircle name="hourglass-outline" tone="warning" size={40} />
              <View className="flex-1">
                <Text variant="subtitle">{t("guard.awaitingResident")}</Text>
                <Text variant="bodySmall" color="secondary">
                  {t("guard.awaitingResidentBody")}
                </Text>
              </View>
            </Card>
          )}

          {v.status === "APPROVED" && !v.entryTime && (
            <Button
              label={t("guard.markEntryCta")}
              variant="success"
              size="lg"
              leftIcon="enter-outline"
              loading={markEntry.isPending}
              onPress={() => markEntry.mutate({ visitorId: v.id })}
              fullWidth
            />
          )}

          {v.entryTime && !v.exitTime && (
            <Button
              label={t("guard.markExitCta")}
              variant="primary"
              size="lg"
              leftIcon="exit-outline"
              loading={markExit.isPending}
              onPress={() => markExit.mutate({ visitorId: v.id })}
              fullWidth
            />
          )}

          {v.exitTime && (
            <Card variant="filled" className="flex-row items-center gap-3">
              <IconCircle name="checkmark-done-outline" tone="success" size={40} />
              <Text variant="subtitle" className="flex-1">
                {t("guard.visitComplete")}
              </Text>
            </Card>
          )}

          {(v.status === "DENIED" || v.status === "EXPIRED") && (
            <Card variant="filled" className="flex-row items-center gap-3">
              <IconCircle name="close-circle-outline" tone="danger" size={40} />
              <Text variant="subtitle" className="flex-1">
                {v.status === "DENIED"
                  ? t("guard.deniedNote")
                  : t("guard.expiredNote")}
              </Text>
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}
