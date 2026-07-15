import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  IconCircle,
  Input,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { formatDateTime } from "@/utils/format";

/** Selectable chip row. */
function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={`rounded-full border px-4 py-2 active:opacity-80 ${
              active ? "border-primary bg-primary-soft" : "border-border bg-surface"
            }`}
          >
            <Text variant="subtitle" color={active ? "primary" : "secondary"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type StartKey = "now" | "in1h" | "tomorrow9";
type DurationH = "2" | "4" | "8" | "24";

function startDate(key: StartKey): Date {
  const d = new Date();
  if (key === "in1h") d.setHours(d.getHours() + 1);
  if (key === "tomorrow9") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

export default function PreApproveScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [start, setStart] = useState<StartKey>("now");
  const [duration, setDuration] = useState<DurationH>("4");

  const create = trpc.guestPreApproval.create.useMutation({
    onSuccess: () => {
      showToast(t("passes.createdToast"), "success");
      void utils.guestPreApproval.list.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const pass = create.data;

  const onSubmit = () => {
    if (!guestName.trim() || guestPhone.trim().length < 8) {
      showToast(t("passes.missing"), "error");
      return;
    }
    const from = startDate(start);
    const to = new Date(from.getTime() + Number(duration) * 3_600_000);
    create.mutate({
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      validFrom: from.toISOString(),
      validTo: to.toISOString(),
      vehicleNumber: vehicle.trim() || undefined,
    });
  };

  // Success view: the shareable QR pass.
  if (pass) {
    return (
      <Screen scroll contentClassName="gap-5 pb-8">
        <StackHeader title={t("passes.readyTitle")} />
        <View className="items-center gap-4 pt-4">
          <IconCircle name="checkmark-circle-outline" tone="success" size={64} />
          <View className="items-center gap-1">
            <Text variant="h1" align="center">
              {pass.guestName}
            </Text>
            <Text variant="body" color="secondary" align="center">
              {formatDateTime(pass.validFrom)} → {formatDateTime(pass.validTo)}
            </Text>
          </View>
          <View className="rounded-3xl bg-white p-5">
            <QRCode value={pass.qrCode} size={220} />
          </View>
          <Text variant="bodySmall" color="secondary" align="center" className="px-6">
            {t("passes.qrHint")}
          </Text>
        </View>
        <Button
          label={t("common.done")}
          variant="primary"
          size="lg"
          onPress={() => router.back()}
          fullWidth
        />
      </Screen>
    );
  }

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("dashboard.preApproveGuest")} />
      <Text variant="body" color="secondary">
        {t("passes.subtitle")}
      </Text>

      <Card className="gap-4">
        <Input
          label={t("passes.guestName")}
          leftIcon="person-outline"
          placeholder={t("passes.guestNamePlaceholder")}
          value={guestName}
          onChangeText={setGuestName}
        />
        <PhoneInput
          label={t("visitors.phone")}
          leftIcon="call-outline"
          placeholder="9876543210"
          value={guestPhone}
          onChangeText={setGuestPhone}
        />

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("passes.from")}
          </Text>
          <Chips
            value={start}
            onChange={setStart}
            options={[
              { value: "now", label: t("passes.now") },
              { value: "in1h", label: t("passes.in1h") },
              { value: "tomorrow9", label: t("passes.tomorrow9") },
            ]}
          />
        </View>

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("passes.duration")}
          </Text>
          <Chips
            value={duration}
            onChange={setDuration}
            options={[
              { value: "2", label: t("passes.hours", { count: 2 }) },
              { value: "4", label: t("passes.hours", { count: 4 }) },
              { value: "8", label: t("passes.hours", { count: 8 }) },
              { value: "24", label: t("passes.hours", { count: 24 }) },
            ]}
          />
        </View>

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
          label={t("passes.generate")}
          variant="primary"
          size="lg"
          leftIcon="qr-code-outline"
          loading={create.isPending}
          onPress={onSubmit}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
