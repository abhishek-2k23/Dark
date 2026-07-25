import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Loading } from "@/components/ListState";
import {
  Button,
  Card,
  FieldLabel,
  Icon,
  Input,
  PhoneInput,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

/**
 * Invite one resident to one flat.
 *
 * A flat holds a single resident, so any flat that already has one is shown but
 * not offered — greyed out and unpressable rather than hidden, because an admin
 * looking for "A-304" needs to see that it exists and is taken, not wonder
 * whether they mistyped the tower.
 */

function Chip({
  label,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${
        disabled
          ? "border-border bg-surface-muted opacity-50"
          : active
            ? "border-primary bg-primary-soft active:opacity-80"
            : "border-border bg-surface active:opacity-80"
      }`}
    >
      {disabled && <Icon name="person" size={13} color="tertiary" />}
      <Text
        variant="subtitle"
        color={disabled ? "tertiary" : active ? "primary" : "secondary"}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SingleInvite() {
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

  const items = flats.data?.items ?? [];
  const anyOccupied = items.some((f) => f.isOccupied);

  return (
    <View className="gap-5 pb-8">
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
            ) : items.length === 0 ? (
              <Text variant="bodySmall" color="tertiary">
                {t("admin.noFlats")}
              </Text>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {items.map((f) => (
                    <Chip
                      key={f.id}
                      label={f.flatNumber}
                      active={f.id === flatId}
                      disabled={f.isOccupied}
                      onPress={() => setFlatId(f.id)}
                    />
                  ))}
                </View>
                {anyOccupied && (
                  <Text variant="caption" color="tertiary">
                    {t("admin.occupiedFlatsHint")}
                  </Text>
                )}
              </>
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
    </View>
  );
}
