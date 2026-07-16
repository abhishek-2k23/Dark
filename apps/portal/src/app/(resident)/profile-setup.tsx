import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { AvatarPicker } from "@/components/media";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Input,
  Link,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

/**
 * Profile photo + emergency-contact form. Two entry points:
 *  - first login after signup (onboarding copy + skip link)
 *  - "edit" from the profile tab (?edit=1 — prefilled, saves then goes back)
 */
export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === "1";
  const user = useAuthStore((s) => s.user);
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const me = trpc.profile.me.useQuery(undefined, { enabled: isEdit });
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);

  // Prefill once when editing.
  useEffect(() => {
    if (isEdit && me.data) {
      setContactName(me.data.emergencyContactName ?? "");
      setContactPhone(me.data.emergencyContactPhone ?? "");
      setAvatarUrl(me.data.avatarUrl ?? null);
    }
  }, [isEdit, me.data]);

  /**
   * The photo saves on pick rather than waiting for the form's Save, because
   * onboarding offers a Skip link — a tapped-through avatar would otherwise be
   * silently discarded by the one path most likely to be taken.
   */
  const saveAvatar = trpc.profile.update.useMutation({
    onSuccess: () => void utils.profile.me.invalidate(),
  });

  const onAvatarChange = (url: string | null) => {
    const previous = avatarUrl;
    setAvatarUrl(url);
    saveAvatar.mutate(
      { avatarUrl: url },
      {
        onError: (e) => {
          setAvatarUrl(previous); // put the old photo back rather than lie
          showToast(toErrorMessage(e, t), "error");
        },
      },
    );
  };

  const done = () =>
    isEdit ? router.back() : router.replace("/(resident)");

  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      showToast(t("profileSetup.saved"), "success");
      void utils.profile.me.invalidate();
      done();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-6 pb-8">
      {isEdit ? (
        <>
          <StackHeader title={t("profile.emergencyContact")} />
          <View className="items-center">
            <AvatarPicker
              value={avatarUrl}
              onChange={onAvatarChange}
              name={user?.name}
              size={88}
              label={t("profileSetup.photoHint")}
            />
          </View>
        </>
      ) : (
        <View className="items-center gap-3 pt-10">
          <AvatarPicker
            value={avatarUrl}
            onChange={onAvatarChange}
            name={user?.name}
            size={88}
            label={t("profileSetup.photoHint")}
          />
          <View className="items-center gap-1">
            <Text variant="h1" align="center">
              {t("profileSetup.title", { name: user?.name?.split(" ")[0] ?? "" })}
            </Text>
            <Text variant="body" color="secondary" align="center">
              {t("profileSetup.subtitle")}
            </Text>
          </View>
        </View>
      )}

      <View className="gap-4">
        <Input
          label={t("profileSetup.contactName")}
          leftIcon="person-outline"
          placeholder={t("profileSetup.contactNamePlaceholder")}
          value={contactName}
          onChangeText={setContactName}
        />
        <PhoneInput
          label={t("profileSetup.contactPhone")}
          leftIcon="call-outline"
          placeholder="9876543210"
          value={contactPhone}
          onChangeText={setContactPhone}
        />
      </View>

      <Button
        label={t("common.save")}
        variant="primary"
        size="lg"
        loading={update.isPending}
        onPress={() => {
          if (!contactName.trim() || contactPhone.trim().length < 8) {
            showToast(t("profileSetup.missing"), "error");
            return;
          }
          update.mutate({
            emergencyContactName: contactName.trim(),
            emergencyContactPhone: contactPhone.trim(),
          });
        }}
        fullWidth
      />

      {!isEdit && (
        <View className="items-center">
          <Link label={t("profileSetup.skip")} color="secondary" onPress={done} />
        </View>
      )}
    </Screen>
  );
}
