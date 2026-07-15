import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
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

/**
 * Emergency-contact form. Two entry points:
 *  - first login after signup (onboarding copy + skip link)
 *  - "edit" from the profile tab (?edit=1 — prefilled, saves then goes back)
 * (Avatar upload arrives with real Cloudinary credentials — deferred.)
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

  // Prefill once when editing.
  useEffect(() => {
    if (isEdit && me.data) {
      setContactName(me.data.emergencyContactName ?? "");
      setContactPhone(me.data.emergencyContactPhone ?? "");
    }
  }, [isEdit, me.data]);

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
        <StackHeader title={t("profile.emergencyContact")} />
      ) : (
        <View className="items-center gap-3 pt-10">
          <Avatar name={user?.name} size={88} />
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
