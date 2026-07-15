import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import {
  VISITOR_PENDING_TTL_MIN,
  visitorPurposeIcon,
  visitorStatusTone,
} from "@/utils/domain";
import { countdown, formatDateTime } from "@/utils/format";

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
    <Card variant="filled" className="flex-row items-center gap-3">
      <IconCircle name={icon} tone="primary" size={40} />
      <View className="flex-1 gap-0.5">
        <Text variant="overline" color="secondary">
          {label}
        </Text>
        <Text variant="subtitle">{value}</Text>
      </View>
    </Card>
  );
}

export default function VisitorDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const q = trpc.visitor.get.useQuery({ visitorId: id ?? "" }, { enabled: !!id });

  // 1s tick that drives the pending countdown.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const afterDecision = () => {
    void utils.visitor.invalidate();
    router.back();
  };
  const approve = trpc.visitor.approve.useMutation({
    onSuccess: () => {
      showToast(t("visitors.approvedToast"), "success");
      afterDecision();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const deny = trpc.visitor.deny.useMutation({
    onSuccess: () => {
      showToast(t("visitors.deniedToast"), "info");
      afterDecision();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const v = q.data;
  const remaining = v?.status === "PENDING"
    ? countdown(
        new Date(
          new Date(v.createdAt).getTime() + VISITOR_PENDING_TTL_MIN * 60_000,
        ),
      )
    : null;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("visitors.requestTitle")} />

      {q.isLoading ? (
        <Loading variant="detail" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : v ? (
        <>
          {v.status === "PENDING" && (
            <View className="items-center gap-1">
              <Badge
                label={remaining ?? t("visitors.expiringNow")}
                tone="warning"
                size="md"
              />
              <Text variant="overline" color="secondary">
                {t("visitors.awaiting")}
              </Text>
            </View>
          )}

          {/* Visitor identity */}
          <View className="items-center gap-3">
            {v.photoUrl ? (
              <Image
                source={{ uri: v.photoUrl }}
                style={{ width: "100%", height: 280, borderRadius: 24 }}
                contentFit="cover"
              />
            ) : (
              <IconCircle
                name={visitorPurposeIcon[v.purpose] ?? "help-circle-outline"}
                tone="primary"
                size={88}
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
          </View>

          <InfoRow
            icon="clipboard-outline"
            label={t("visitors.purpose")}
            value={t(`enums.visitorPurpose.${v.purpose}`)}
          />
          <InfoRow
            icon="call-outline"
            label={t("visitors.phone")}
            value={v.phone}
          />
          <InfoRow
            icon="shield-outline"
            label={t("visitors.registeredBy")}
            value={v.registeredByGuard.name}
          />
          {v.vehicleNumber && (
            <InfoRow
              icon="car-outline"
              label={t("visitors.vehicle")}
              value={v.vehicleNumber}
            />
          )}
          {v.entryTime && (
            <InfoRow
              icon="enter-outline"
              label={t("visitors.entry")}
              value={formatDateTime(v.entryTime)}
            />
          )}
          {v.exitTime && (
            <InfoRow
              icon="exit-outline"
              label={t("visitors.exit")}
              value={formatDateTime(v.exitTime)}
            />
          )}
          {v.actionedByResident && (
            <InfoRow
              icon="person-outline"
              label={t("visitors.actionedBy")}
              value={v.actionedByResident.name}
            />
          )}

          {v.status === "PENDING" && (
            <View className="flex-row gap-3 pt-2">
              <Button
                label={t("common.deny")}
                variant="dangerSoft"
                size="lg"
                leftIcon="close-circle-outline"
                className="flex-1"
                loading={deny.isPending}
                onPress={() => deny.mutate({ visitorId: v.id })}
              />
              <Button
                label={t("common.approve")}
                variant="success"
                size="lg"
                leftIcon="checkmark-circle-outline"
                className="flex-1"
                loading={approve.isPending}
                onPress={() => approve.mutate({ visitorId: v.id })}
              />
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}
