import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Icon,
  IconCircle,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { visitorPurposeIcon } from "@/utils/domain";

const PURPOSES = ["GUEST", "DELIVERY", "CAB", "SERVICE_STAFF", "OTHER"] as const;
type Purpose = (typeof PURPOSES)[number];

interface SelectedFlat {
  id: string;
  flatNumber: string;
  towerName: string;
}

/** Search + pick the target flat before filling in visitor details. */
function FlatPicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: SelectedFlat | null;
  onSelect: (flat: SelectedFlat) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = trpc.gate.searchFlats.useQuery(
    { search: search.trim() || undefined, limit: 20 },
    { enabled: !selected },
  );

  if (selected) {
    return (
      <Card variant="tonal" className="flex-row items-center gap-3">
        <IconCircle name="home-outline" tone="primary" size={40} />
        <View className="flex-1">
          <Text variant="title">
            {t("guard.flatLine", {
              tower: selected.towerName,
              flat: selected.flatNumber,
            })}
          </Text>
          <Text variant="caption" color="secondary">
            {t("guard.targetFlat")}
          </Text>
        </View>
        <Button
          label={t("guard.change")}
          variant="ghost"
          size="sm"
          onPress={onClear}
        />
      </Card>
    );
  }

  const results = q.data ?? [];

  return (
    <View className="gap-3">
      <Input
        label={t("guard.targetFlat")}
        leftIcon="search-outline"
        placeholder={t("guard.searchFlatPlaceholder")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {q.isLoading ? (
        <Loading className="py-8" />
      ) : results.length === 0 ? (
        <EmptyState
          icon="home-outline"
          title={t("guard.noFlats")}
          className="py-8"
        />
      ) : (
        <View className="gap-2">
          {results.map((f) => (
            <Pressable
              key={f.id}
              onPress={() =>
                onSelect({ id: f.id, flatNumber: f.flatNumber, towerName: f.towerName })
              }
              className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 active:opacity-80"
            >
              <IconCircle name="home-outline" tone="neutral" size={38} />
              <View className="flex-1">
                <Text variant="subtitle">
                  {t("guard.flatLine", { tower: f.towerName, flat: f.flatNumber })}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {f.residentNames.length > 0
                    ? f.residentNames.join(", ")
                    : t("guard.noResidents")}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color="tertiary" />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function RegisterVisitor() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [flat, setFlat] = useState<SelectedFlat | null>(null);
  const [purpose, setPurpose] = useState<Purpose>("GUEST");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");

  const register = trpc.visitor.register.useMutation({
    onSuccess: (v) => {
      showToast(t("guard.registeredToast"), "success");
      void utils.visitor.history.invalidate();
      router.replace(`/(guard)/visitors/${v.id}`);
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const onSubmit = () => {
    if (!flat) {
      showToast(t("guard.selectFlatFirst"), "error");
      return;
    }
    if (!name.trim() || phone.trim().length < 8) {
      showToast(t("guard.missingVisitor"), "error");
      return;
    }
    register.mutate({
      flatId: flat.id,
      purpose,
      name: name.trim(),
      phone: phone.trim(),
      vehicleNumber: vehicle.trim() || undefined,
    });
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("guard.registerVisitor")} />

      <FlatPicker selected={flat} onSelect={setFlat} onClear={() => setFlat(null)} />

      {flat && (
        <Card className="gap-4">
          <View className="gap-2">
            <Text variant="subtitle" color="primary">
              {t("visitors.purpose")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {PURPOSES.map((p) => {
                const active = p === purpose;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPurpose(p)}
                    className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-80 ${
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface"
                    }`}
                  >
                    <Icon
                      name={visitorPurposeIcon[p] ?? "help-circle-outline"}
                      size={16}
                      color={active ? "primary" : "secondary"}
                    />
                    <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                      {t(`enums.visitorPurpose.${p}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            label={t("passes.guestName")}
            leftIcon="person-outline"
            placeholder={t("passes.guestNamePlaceholder")}
            value={name}
            onChangeText={setName}
          />
          <Input
            label={t("visitors.phone")}
            leftIcon="call-outline"
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Input
            label={t("visitors.vehicle")}
            labelHint={t("common.optional")}
            leftIcon="car-outline"
            placeholder="KA-01-AB-1234"
            autoCapitalize="characters"
            value={vehicle}
            onChangeText={setVehicle}
          />

          <Button
            label={t("guard.registerCta")}
            variant="primary"
            size="lg"
            leftIcon="checkmark-circle-outline"
            loading={register.isPending}
            onPress={onSubmit}
            fullWidth
          />
          <Text variant="caption" color="tertiary" align="center">
            {t("guard.photoDeferred")}
          </Text>
        </Card>
      )}
    </Screen>
  );
}
