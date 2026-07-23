import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  FieldLabel,
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

/** Mirrors the AdminDesignation enum on the backend. */
const DESIGNATIONS = [
  "PRESIDENT",
  "SECRETARY",
  "TREASURER",
  "COMMITTEE_MEMBER",
  "MANAGER",
  "OTHER",
] as const;
type Designation = (typeof DESIGNATIONS)[number];

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
  const [designation, setDesignation] = useState<Designation | null>(null);

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
        : { designation: designation ?? undefined }),
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
          required
          leftIcon="person-outline"
          placeholder={t("signup.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t("signup.email")}
          required
          leftIcon="mail-outline"
          placeholder="staff@email.com"
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
        <PasswordInput
          label={t("admin.tempPassword")}
          required
          leftIcon="key-outline"
          helperText={t("admin.tempPasswordHint")}
          value={password}
          onChangeText={setPassword}
        />

        {role === "GUARD" ? (
          <>
            <Input
              label={t("guard.gateAssigned")}
              leftIcon="location-outline"
              placeholder={t("admin.gatePlaceholder")}
              value={gate}
              onChangeText={setGate}
            />
            <View className="flex-row gap-3">
              <Input
                containerClassName="flex-1"
                label={t("admin.shiftStart")}
                placeholder="08:00"
                value={shiftStart}
                onChangeText={setShiftStart}
              />
              <Input
                containerClassName="flex-1"
                label={t("admin.shiftEnd")}
                placeholder="20:00"
                value={shiftEnd}
                onChangeText={setShiftEnd}
              />
            </View>
          </>
        ) : (
          <View className="gap-2">
            <FieldLabel label={t("admin.designation")} />
            <View className="flex-row flex-wrap gap-2">
              {DESIGNATIONS.map((d) => {
                const active = d === designation;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDesignation(active ? null : d)}
                    className={`rounded-full border px-3.5 py-2 active:opacity-80 ${
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface"
                    }`}
                  >
                    <Text
                      variant="subtitle"
                      color={active ? "primary" : "secondary"}
                    >
                      {t(`admin.designations.${d}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
