import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ImageField } from "@/components/media";
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
import { noticeCategoryIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

const CATEGORIES = ["GENERAL", "MAINTENANCE", "EVENT", "EMERGENCY"] as const;
type Category = (typeof CATEGORIES)[number];

type When = "now" | "in1h" | "tomorrow9" | "in3d";

function scheduleDate(when: When): string | undefined {
  if (when === "now") return undefined;
  const d = new Date();
  if (when === "in1h") d.setHours(d.getHours() + 1);
  if (when === "tomorrow9") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  if (when === "in3d") d.setDate(d.getDate() + 3);
  return d.toISOString();
}

export default function CreateNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const isEdit = !!id;

  const existing = trpc.notice.list.useQuery(
    { limit: 100 },
    { enabled: isEdit },
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("GENERAL");
  const [pinned, setPinned] = useState(false);
  const [when, setWhen] = useState<When>("now");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isEdit || loaded) return;
    const n = existing.data?.items.find((x) => x.id === id);
    if (n) {
      setTitle(n.title);
      setBody(n.body);
      setCategory(n.category as Category);
      setPinned(n.isPinned);
      setImageUrl(n.imageUrl ?? null);
      setLoaded(true);
    }
  }, [existing.data, id, isEdit, loaded]);

  const afterSave = () => {
    void utils.notice.list.invalidate();
    router.back();
  };
  const create = trpc.notice.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.noticePosted"), "success");
      afterSave();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const update = trpc.notice.update.useMutation({
    onSuccess: () => {
      showToast(t("admin.noticeSaved"), "success");
      afterSave();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const busy = create.isPending || update.isPending;

  const onSubmit = () => {
    if (!title.trim() || !body.trim()) {
      showToast(t("admin.noticeMissing"), "error");
      return;
    }
    const scheduledAt = scheduleDate(when);
    if (isEdit) {
      update.mutate({
        noticeId: id!,
        title: title.trim(),
        body: body.trim(),
        imageUrl,
        category,
        isPinned: pinned,
        // "now" publishes immediately (null); a preset reschedules.
        scheduledAt: scheduledAt ?? null,
      });
    } else {
      create.mutate({
        title: title.trim(),
        body: body.trim(),
        imageUrl,
        category,
        isPinned: pinned,
        ...(scheduledAt ? { scheduledAt } : {}),
      });
    }
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={isEdit ? t("admin.editNotice") : t("admin.newNotice")} />

      <Card className="gap-4">
        {/* A banner is what makes a notice scannable in a busy feed. */}
        <ImageField
          value={imageUrl}
          onChange={setImageUrl}
          kind="NOTICE"
          label={t("admin.noticeBanner")}
          labelHint={t("common.optional")}
          hint={t("admin.noticeBannerHint")}
          aspect={[3, 1]}
        />
        <Input
          label={t("tickets.titleLabel")}
          leftIcon="create-outline"
          placeholder={t("admin.noticeTitlePlaceholder")}
          value={title}
          onChangeText={setTitle}
        />
        <Input
          label={t("admin.noticeBody")}
          placeholder={t("admin.noticeBodyPlaceholder")}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={5}
          style={{ minHeight: 120, textAlignVertical: "top" }}
        />

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("tickets.category")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-80 ${
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <Icon
                    name={noticeCategoryIcon[c] ?? "megaphone-outline"}
                    size={16}
                    color={active ? "primary" : "secondary"}
                  />
                  <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                    {t(`enums.noticeCategory.${c}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => setPinned((p) => !p)}
          className="flex-row items-center justify-between active:opacity-80"
        >
          <View className="flex-row items-center gap-2">
            <Icon name="pin-outline" size={18} color="secondary" />
            <Text variant="subtitle">{t("admin.pinNotice")}</Text>
          </View>
          <Icon
            name={pinned ? "toggle" : "toggle-outline"}
            size={30}
            color={pinned ? "primary" : "tertiary"}
          />
        </Pressable>

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("admin.publishWhen")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["now", t("admin.publishNow")],
                ["in1h", t("passes.in1h")],
                ["tomorrow9", t("passes.tomorrow9")],
                ["in3d", t("admin.in3days")],
              ] as [When, string][]
            ).map(([value, label]) => {
              const active = value === when;
              return (
                <Pressable
                  key={value}
                  onPress={() => setWhen(value)}
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
          {when !== "now" && (
            <Text variant="caption" color="secondary">
              {t("admin.willPublish", {
                date: formatDateTime(scheduleDate(when)!),
              })}
            </Text>
          )}
        </View>

        <Button
          label={isEdit ? t("common.save") : t("admin.publishNotice")}
          variant="primary"
          size="lg"
          loading={busy}
          onPress={onSubmit}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
