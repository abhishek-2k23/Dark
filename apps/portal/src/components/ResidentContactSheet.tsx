import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button, Input, PhoneInput, Sheet, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

/**
 * Fills in the contact details a resident record is missing.
 *
 * This exists for bulk-imported residents above all: a row imported without an
 * email is on the register but can never be claimed, because signup matches on
 * email. Until an admin can add one, that resident is stuck.
 *
 * Only missing fields are offered. The backend refuses to overwrite a contact
 * that is already set — an admin rewriting someone's email would own a
 * password-reset path into their account — so showing a filled field as
 * editable would only promise something the server will reject.
 */
export function ResidentContactSheet({
  visible,
  onClose,
  userId,
  missingEmail,
  missingPhone,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  missingEmail: boolean;
  missingPhone: boolean;
}) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // A reopened sheet should start clean rather than showing what was abandoned
  // last time.
  useEffect(() => {
    if (visible) {
      setEmail("");
      setPhone("");
    }
  }, [visible]);

  const mutation = trpc.resident.updateContact.useMutation({
    onSuccess: () => {
      showToast(t("admin.residentDetail.contactSaved"), "success");
      void utils.resident.detail.invalidate();
      void utils.resident.list.invalidate();
      onClose();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const trimmedEmail = email.trim();
  const canSave = trimmedEmail.length > 0 || phone.length === 10;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("admin.residentDetail.addContact")}
      subtitle={t("admin.residentDetail.addContactHint")}
    >
      <View className="gap-4">
        {missingEmail && (
          <Input
            label={t("signup.email")}
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        {missingPhone && (
          <PhoneInput
            label={t("signup.phone")}
            placeholder={t("auth.phonePlaceholder")}
            value={phone}
            onChangeText={setPhone}
          />
        )}

        {missingEmail && (
          <Text variant="caption" color="tertiary">
            {t("admin.residentDetail.addContactClaim")}
          </Text>
        )}
      </View>

      <Button
        label={t("common.save")}
        size="lg"
        fullWidth
        loading={mutation.isPending}
        disabled={!canSave || mutation.isPending}
        onPress={() =>
          mutation.mutate({
            userId,
            // Blank fields are left out entirely — the server treats an absent
            // field as "no change" and rejects an empty payload.
            ...(trimmedEmail ? { email: trimmedEmail } : {}),
            ...(phone.length === 10 ? { phone } : {}),
          })
        }
      />
    </Sheet>
  );
}
