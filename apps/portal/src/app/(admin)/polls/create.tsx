import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Icon,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { formatDate } from "@/utils/format";

type Deadline = "in3d" | "in7d" | "in14d";

function deadlineDate(d: Deadline): Date {
  const date = new Date();
  const days = d === "in3d" ? 3 : d === "in7d" ? 7 : 14;
  date.setDate(date.getDate() + days);
  return date;
}

export default function CreatePoll() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [deadline, setDeadline] = useState<Deadline>("in7d");

  const create = trpc.poll.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.pollCreated"), "success");
      void utils.poll.list.invalidate();
      router.back();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const setOption = (i: number, v: string) =>
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOption = () =>
    setOptions((o) => (o.length >= 10 ? o : [...o, ""]));
  const removeOption = (i: number) =>
    setOptions((o) => (o.length <= 2 ? o : o.filter((_, idx) => idx !== i)));

  const onSubmit = () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || clean.length < 2) {
      showToast(t("admin.pollMissing"), "error");
      return;
    }
    create.mutate({
      question: question.trim(),
      options: clean,
      allowMultiple,
      deadline: deadlineDate(deadline).toISOString(),
    });
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("admin.newPoll")} />

      <Card className="gap-4">
        <Input
          label={t("admin.question")}
          leftIcon="help-circle-outline"
          placeholder={t("admin.questionPlaceholder")}
          value={question}
          onChangeText={setQuestion}
          multiline
          style={{ minHeight: 60, textAlignVertical: "top" }}
        />

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("admin.options")}
          </Text>
          {options.map((opt, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Input
                containerClassName="flex-1"
                placeholder={t("admin.optionN", { n: i + 1 })}
                value={opt}
                onChangeText={(v) => setOption(i, v)}
              />
              {options.length > 2 && (
                <Pressable
                  onPress={() => removeOption(i)}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-danger-soft active:opacity-70"
                >
                  <Icon name="close" size={18} color="danger" />
                </Pressable>
              )}
            </View>
          ))}
          {options.length < 10 && (
            <Button
              label={t("admin.addOption")}
              variant="ghost"
              size="sm"
              leftIcon="add"
              onPress={addOption}
            />
          )}
        </View>

        <Pressable
          onPress={() => setAllowMultiple((m) => !m)}
          className="flex-row items-center justify-between active:opacity-80"
        >
          <Text variant="subtitle">{t("admin.allowMultiple")}</Text>
          <Icon
            name={allowMultiple ? "toggle" : "toggle-outline"}
            size={30}
            color={allowMultiple ? "primary" : "tertiary"}
          />
        </Pressable>

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("admin.closesOn")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["in3d", t("admin.days", { count: 3 })],
                ["in7d", t("admin.days", { count: 7 })],
                ["in14d", t("admin.days", { count: 14 })],
              ] as [Deadline, string][]
            ).map(([value, label]) => {
              const active = value === deadline;
              return (
                <Pressable
                  key={value}
                  onPress={() => setDeadline(value)}
                  className={`rounded-full border px-4 py-2 active:opacity-80 ${
                    active ? "border-primary bg-primary-soft" : "border-border bg-surface"
                  }`}
                >
                  <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" color="secondary">
            {t("polls.deadline", { date: formatDate(deadlineDate(deadline)) })}
          </Text>
        </View>

        <Button
          label={t("admin.createPollCta")}
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
