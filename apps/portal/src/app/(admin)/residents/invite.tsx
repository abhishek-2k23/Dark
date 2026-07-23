import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  FieldLabel,
  Input,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-4 py-2 active:opacity-80 ${
        active ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      <Text variant="subtitle" color={active ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function InviteResident() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);

  const [towerId, setTowerId] = useState<string | null>(null);
  const [flatId, setFlatId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const towers = trpc.tower.list.useQuery();
  const flats = trpc.flat.list.useQuery(
    { towerId: towerId ?? undefined, limit: 100 },
    { enabled: !!towerId },
  );

  const invite = trpc.resident.invite.useMutation({
    onSuccess: () => {
      showToast(t("admin.inviteSent"), "success");
      router.back();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("admin.inviteResident")} />
      <Text variant="body" color="secondary">
        {t("admin.inviteHint")}
      </Text>

      <Card className="gap-4">
        <View className="gap-2">
          <FieldLabel label={t("admin.tower")} required />
          {towers.isLoading ? (
            <Loading className="py-4" />
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {towers.data?.map((tw) => (
                <Chip
                  key={tw.id}
                  label={tw.name}
                  active={tw.id === towerId}
                  onPress={() => {
                    setTowerId(tw.id);
                    setFlatId(null);
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {towerId && (
          <View className="gap-2">
            <FieldLabel label={t("admin.flat")} required />
            {flats.isLoading ? (
              <Loading className="py-4" />
            ) : (flats.data?.items.length ?? 0) === 0 ? (
              <Text variant="bodySmall" color="tertiary">
                {t("admin.noFlats")}
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {flats.data?.items.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.flatNumber}
                    active={f.id === flatId}
                    onPress={() => setFlatId(f.id)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <Input
          label={t("signup.email")}
          required
          leftIcon="mail-outline"
          placeholder="resident@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <PhoneInput
          label={t("signup.phone")}
          required
          helperText={t("signup.oneRequired")}
          leftIcon="call-outline"
          placeholder="9876543210"
          value={phone}
          onChangeText={setPhone}
        />

        <Button
          label={t("admin.sendInvite")}
          variant="primary"
          size="lg"
          loading={invite.isPending}
          onPress={() => {
            if (!flatId) {
              showToast(t("admin.selectFlat"), "error");
              return;
            }
            if (!email.trim() && !phone.trim()) {
              showToast(t("admin.emailOrPhone"), "error");
              return;
            }
            invite.mutate({
              flatId,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            });
          }}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
