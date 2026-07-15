import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Input,
  PasswordInput,
  PhoneInput,
  Screen,
  SegmentedControl,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

type Role = "GUARD" | "ADMIN";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function CreateStaff() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);

  const [role, setRole] = useState<Role>("GUARD");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [gate, setGate] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [designation, setDesignation] = useState("");

  const create = trpc.staff.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.staffCreated"), "success");
      router.back();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const onSubmit = () => {
    if (!name.trim()) return showToast(t("admin.staffNameRequired"), "error");
    if (!email.trim() && !phone.trim())
      return showToast(t("admin.emailOrPhone"), "error");
    if (password.trim().length < 8)
      return showToast(t("admin.passwordMin"), "error");
    if (
      role === "GUARD" &&
      ((shiftStart && !TIME_RE.test(shiftStart)) ||
        (shiftEnd && !TIME_RE.test(shiftEnd)))
    )
      return showToast(t("admin.badTime"), "error");

    create.mutate({
      role,
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      temporaryPassword: password.trim(),
      ...(role === "GUARD"
        ? {
            gateAssigned: gate.trim() || undefined,
            shiftStart: shiftStart.trim() || undefined,
            shiftEnd: shiftEnd.trim() || undefined,
          }
        : { designation: designation.trim() || undefined }),
    });
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("admin.staffAccounts")} />
      <Text variant="body" color="secondary">
        {t("admin.staffHint")}
      </Text>

      <Card className="gap-4">
        <SegmentedControl
          value={role}
          onChange={setRole}
          options={[
            { value: "GUARD", label: t("guard.roleBadge") },
            { value: "ADMIN", label: t("admin.roleBadge") },
          ]}
        />

        <Input
          label={t("signup.name")}
          leftIcon="person-outline"
          placeholder={t("signup.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t("signup.email")}
          labelHint={t("signup.oneRequired")}
          leftIcon="mail-outline"
          placeholder="staff@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <PhoneInput
          label={t("signup.phone")}
          labelHint={t("signup.oneRequired")}
          leftIcon="call-outline"
          placeholder="9876543210"
          value={phone}
          onChangeText={setPhone}
        />
        <PasswordInput
          label={t("admin.tempPassword")}
          leftIcon="key-outline"
          helperText={t("admin.tempPasswordHint")}
          value={password}
          onChangeText={setPassword}
        />

        {role === "GUARD" ? (
          <>
            <Input
              label={t("guard.gateAssigned")}
              labelHint={t("common.optional")}
              leftIcon="location-outline"
              placeholder={t("admin.gatePlaceholder")}
              value={gate}
              onChangeText={setGate}
            />
            <View className="flex-row gap-3">
              <Input
                containerClassName="flex-1"
                label={t("admin.shiftStart")}
                labelHint={t("common.optional")}
                placeholder="08:00"
                value={shiftStart}
                onChangeText={setShiftStart}
              />
              <Input
                containerClassName="flex-1"
                label={t("admin.shiftEnd")}
                labelHint={t("common.optional")}
                placeholder="20:00"
                value={shiftEnd}
                onChangeText={setShiftEnd}
              />
            </View>
          </>
        ) : (
          <Input
            label={t("admin.designation")}
            labelHint={t("common.optional")}
            leftIcon="ribbon-outline"
            placeholder={t("admin.designationPlaceholder")}
            value={designation}
            onChangeText={setDesignation}
          />
        )}

        <Button
          label={t("admin.createStaff")}
          variant="primary"
          size="lg"
          loading={create.isPending}
          onPress={onSubmit}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
