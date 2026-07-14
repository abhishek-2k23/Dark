import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
  Button,
  Card,
  Icon,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

export default function FamilyScreen() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [age, setAge] = useState("");

  const q = trpc.profile.me.useQuery();
  const members = q.data?.residentProfile?.familyMembers ?? [];

  const invalidate = () => void utils.profile.me.invalidate();
  const add = trpc.familyMember.add.useMutation({
    onSuccess: () => {
      showToast(t("family.addedToast"), "success");
      setAdding(false);
      setName("");
      setRelation("");
      setAge("");
      invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const remove = trpc.familyMember.remove.useMutation({
    onSuccess: () => {
      showToast(t("family.removedToast"), "info");
      invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("family.title")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : (
        <>
          {members.length === 0 && !adding ? (
            <EmptyState icon="people-outline" title={t("family.empty")} />
          ) : (
            <View className="gap-3">
              {members.map((m) => (
                <Card key={m.id} className="flex-row items-center gap-3">
                  <Avatar uri={m.photoUrl} name={m.name} size={44} />
                  <View className="flex-1 gap-0.5">
                    <Text variant="title">{m.name}</Text>
                    <Text variant="bodySmall" color="secondary">
                      {m.relation}
                      {m.age != null ? ` · ${t("family.age", { age: m.age })}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => remove.mutate({ familyMemberId: m.id })}
                    hitSlop={8}
                    className="h-10 w-10 items-center justify-center rounded-full bg-danger-soft active:opacity-70"
                    accessibilityRole="button"
                  >
                    <Icon name="trash-outline" size={18} color="danger" />
                  </Pressable>
                </Card>
              ))}
            </View>
          )}

          {adding ? (
            <Card className="gap-4">
              <Input
                label={t("signup.name")}
                leftIcon="person-outline"
                value={name}
                onChangeText={setName}
              />
              <Input
                label={t("family.relation")}
                leftIcon="git-branch-outline"
                placeholder={t("family.relationPlaceholder")}
                value={relation}
                onChangeText={setRelation}
              />
              <Input
                label={t("family.ageLabel")}
                labelHint={t("common.optional")}
                leftIcon="calendar-outline"
                keyboardType="number-pad"
                value={age}
                onChangeText={setAge}
              />
              <View className="flex-row gap-3">
                <Button
                  label={t("common.cancel")}
                  variant="ghost"
                  className="flex-1"
                  onPress={() => setAdding(false)}
                />
                <Button
                  label={t("common.save")}
                  variant="primary"
                  className="flex-1"
                  loading={add.isPending}
                  onPress={() => {
                    if (!name.trim() || !relation.trim()) {
                      showToast(t("family.missing"), "error");
                      return;
                    }
                    add.mutate({
                      name: name.trim(),
                      relation: relation.trim(),
                      age: age.trim() ? Number(age.trim()) : undefined,
                    });
                  }}
                />
              </View>
            </Card>
          ) : (
            <Button
              label={t("family.add")}
              variant="secondary"
              leftIcon="person-add-outline"
              onPress={() => setAdding(true)}
              fullWidth
            />
          )}
        </>
      )}
    </Screen>
  );
}
