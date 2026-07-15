import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  Button,
  Card,
  IconCircle,
  Input,
  Link,
  PasswordInput,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

export default function RegisterSocietyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  // Society
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  // Admin
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [designation, setDesignation] = useState("");

  const register = trpc.auth.registerSociety.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t("auth.societyCreatedToast"), "success");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onSubmit = () => {
    if (
      !name.trim() ||
      !address.trim() ||
      !city.trim() ||
      !state.trim() ||
      !pincode.trim() ||
      !adminName.trim()
    ) {
      showToast(t("auth.registerMissingFields"), "error");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      showToast(t("auth.registerMissingAdminId"), "error");
      return;
    }
    if (password.length < 8) {
      showToast(t("auth.registerShortPassword"), "error");
      return;
    }
    register.mutate({
      society: {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
      },
      admin: {
        name: adminName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        designation: designation.trim() || undefined,
      },
    });
  };

  return (
    <Screen scroll aurora="hero" contentClassName="gap-6 py-6">
      <View className="items-center gap-3 pt-2">
        <IconCircle name="business" tone="primary" size={64} />
        <View className="items-center gap-1">
          <Text variant="display" align="center">
            {t("auth.registerSocietyTitle")}
          </Text>
          <Text variant="bodySmall" color="secondary" align="center">
            {t("auth.registerSocietyPrompt")}
          </Text>
        </View>
      </View>

      {/* Society details */}
      <Card className="gap-4">
        <Text variant="label" color="secondary">
          {t("auth.societySection")}
        </Text>
        <Input
          label={t("auth.societyName")}
          leftIcon="business-outline"
          placeholder={t("auth.societyNamePlaceholder")}
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t("auth.address")}
          leftIcon="location-outline"
          placeholder={t("auth.addressPlaceholder")}
          value={address}
          onChangeText={setAddress}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Input label={t("auth.city")} value={city} onChangeText={setCity} />
          </View>
          <View className="flex-1">
            <Input
              label={t("auth.state")}
              value={state}
              onChangeText={setState}
            />
          </View>
        </View>
        <Input
          label={t("auth.pincode")}
          leftIcon="pin-outline"
          keyboardType="number-pad"
          value={pincode}
          onChangeText={setPincode}
        />
      </Card>

      {/* Admin account */}
      <Card className="gap-4">
        <Text variant="label" color="secondary">
          {t("auth.adminSection")}
        </Text>
        <Input
          label={t("auth.adminName")}
          leftIcon="person-outline"
          placeholder={t("auth.adminNamePlaceholder")}
          value={adminName}
          onChangeText={setAdminName}
        />
        <Input
          label={t("auth.identifier")}
          leftIcon="mail-outline"
          placeholder="you@email.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PhoneInput
          label={t("auth.mobileNumber")}
          leftIcon="call-outline"
          placeholder="9876543210"
          value={phone}
          onChangeText={setPhone}
        />
        <PasswordInput
          label={t("auth.password")}
          leftIcon="lock-closed-outline"
          placeholder={t("auth.passwordPlaceholder")}
          value={password}
          onChangeText={setPassword}
        />
        <Input
          label={t("auth.designation")}
          labelHint={t("common.optional")}
          leftIcon="ribbon-outline"
          placeholder={t("auth.designationPlaceholder")}
          value={designation}
          onChangeText={setDesignation}
        />
      </Card>

      <Button
        label={t("auth.registerSocietyCta")}
        variant="primary"
        size="lg"
        rightIcon="arrow-forward"
        loading={register.isPending}
        onPress={onSubmit}
        fullWidth
      />

      <View className="flex-row items-center justify-center gap-2">
        <Text variant="bodySmall" color="secondary">
          {t("auth.haveAccount")}
        </Text>
        <Link label={t("auth.logIn")} size="sm" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
