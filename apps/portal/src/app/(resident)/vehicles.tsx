import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Icon,
  IconCircle,
  Input,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

const TYPES: { value: "CAR" | "BIKE" | "OTHER"; icon: IconName }[] = [
  { value: "CAR", icon: "car-outline" },
  { value: "BIKE", icon: "bicycle-outline" },
  { value: "OTHER", icon: "cube-outline" },
];

export default function VehiclesScreen() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<"CAR" | "BIKE" | "OTHER">("CAR");

  const q = trpc.profile.me.useQuery();
  const vehicles = q.data?.residentProfile?.vehicles ?? [];

  const invalidate = () => void utils.profile.me.invalidate();
  const add = trpc.vehicle.add.useMutation({
    onSuccess: () => {
      showToast(t("vehicles.addedToast"), "success");
      setAdding(false);
      setNumber("");
      invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const remove = trpc.vehicle.remove.useMutation({
    onSuccess: () => {
      showToast(t("vehicles.removedToast"), "info");
      invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("vehicles.title")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : (
        <>
          {vehicles.length === 0 && !adding ? (
            <EmptyState icon="car-outline" title={t("vehicles.empty")} />
          ) : (
            <View className="gap-3">
              {vehicles.map((v) => (
                <Card key={v.id} className="flex-row items-center gap-3">
                  <IconCircle
                    name={TYPES.find((x) => x.value === v.type)?.icon ?? "car-outline"}
                    tone="primary"
                    size={44}
                  />
                  <View className="flex-1 gap-0.5">
                    <Text variant="title">{v.number}</Text>
                    <Text variant="bodySmall" color="secondary">
                      {t(`enums.vehicleType.${v.type}`)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => remove.mutate({ vehicleId: v.id })}
                    hitSlop={8}
                    className="h-10 w-10 items-center justify-center rounded-full bg-danger-soft active:opacity-70"
                    accessibilityRole="button"
                  >
                    <Icon name="trash-outline" size={18} color="danger" />
                  </Pressable>
                </Card>
              ))}
            </View>
          )}

          {adding ? (
            <Card className="gap-4">
              <Input
                label={t("vehicles.number")}
                leftIcon="car-outline"
                placeholder="KA-01-AB-1234"
                autoCapitalize="characters"
                value={number}
                onChangeText={setNumber}
              />
              <View className="flex-row gap-2">
                {TYPES.map((tp) => {
                  const active = tp.value === type;
                  return (
                    <Pressable
                      key={tp.value}
                      onPress={() => setType(tp.value)}
                      className={`flex-1 items-center gap-1 rounded-xl border px-2 py-2.5 active:opacity-80 ${
                        active
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface"
                      }`}
                    >
                      <Icon
                        name={tp.icon}
                        size={18}
                        color={active ? "primary" : "secondary"}
                      />
                      <Text
                        variant="caption"
                        color={active ? "primary" : "secondary"}
                      >
                        {t(`enums.vehicleType.${tp.value}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View className="flex-row gap-3">
                <Button
                  label={t("common.cancel")}
                  variant="ghost"
                  className="flex-1"
                  onPress={() => setAdding(false)}
                />
                <Button
                  label={t("common.save")}
                  variant="primary"
                  className="flex-1"
                  loading={add.isPending}
                  onPress={() => {
                    if (!number.trim()) {
                      showToast(t("vehicles.missing"), "error");
                      return;
                    }
                    add.mutate({ number: number.trim(), type });
                  }}
                />
              </View>
            </Card>
          ) : (
            <Button
              label={t("vehicles.add")}
              variant="secondary"
              leftIcon="add-circle-outline"
              onPress={() => setAdding(true)}
              fullWidth
            />
          )}
        </>
      )}
    </Screen>
  );
}
