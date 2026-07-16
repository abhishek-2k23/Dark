import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { GatePass } from "@/components/GatePass";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Input,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

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
  const [guestEmail, setGuestEmail] = useState("");
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
      guestEmail: guestEmail.trim() || undefined,
      validFrom: from.toISOString(),
      validTo: to.toISOString(),
      vehicleNumber: vehicle.trim() || undefined,
    });
  };

  // Success view: the pass itself, drawn as a ticket.
  if (pass) {
    return (
      <Screen scroll contentClassName="gap-5 pb-8">
        <StackHeader title={t("passes.readyTitle")} />

        <GatePass
          guestName={pass.guestName}
          qrCode={pass.qrCode}
          validFrom={pass.validFrom}
          validTo={pass.validTo}
          vehicleNumber={pass.vehicleNumber}
        />

        {pass.guestEmail && (
          <Text variant="bodySmall" color="secondary" align="center">
            {t("passes.emailedTo", { email: pass.guestEmail })}
          </Text>
        )}

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
        {/* Given an address, the guest gets the pass themselves — no
            forwarding, and nothing to fumble for at the gate. */}
        <Input
          label={t("passes.guestEmail")}
          labelHint={t("common.optional")}
          leftIcon="mail-outline"
          placeholder="guest@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={guestEmail}
          onChangeText={setGuestEmail}
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
