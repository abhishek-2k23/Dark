import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { PhotoGrid } from "@/components/media";
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
import { ticketCategoryIcon } from "@/utils/domain";

const CATEGORIES = ["PLUMBING", "ELECTRICAL", "HOUSEKEEPING", "SECURITY", "OTHER"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export default function CreateTicket() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("PLUMBING");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const create = trpc.ticket.create.useMutation({
    onSuccess: (tk) => {
      showToast(t("tickets.createdToast"), "success");
      void utils.ticket.list.invalidate();
      router.replace(`/(resident)/tickets/${tk.id}`);
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("dashboard.raiseTicket")} />

      <Card className="gap-4">
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
                    name={ticketCategoryIcon[c] ?? "build-outline"}
                    size={16}
                    color={active ? "primary" : "secondary"}
                  />
                  <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                    {t(`enums.ticketCategory.${c}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          label={t("tickets.titleLabel")}
          leftIcon="create-outline"
          placeholder={t("tickets.titlePlaceholder")}
          value={title}
          onChangeText={setTitle}
        />
        <Input
          label={t("tickets.description")}
          placeholder={t("tickets.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />

        {/* Right after the description: a photo of the leak says more than
            the text box ever will, and it saves the "can you send a picture?"
            round-trip that otherwise costs a day. */}
        <PhotoGrid
          value={photoUrls}
          onChange={setPhotoUrls}
          kind="TICKET"
          label={t("tickets.photos")}
          max={5}
        />

        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("tickets.priority")}
          </Text>
          <View className="flex-row gap-2">
            {PRIORITIES.map((p) => {
              const active = p === priority;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  className={`flex-1 items-center rounded-xl border px-3 py-2.5 active:opacity-80 ${
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                    {t(`enums.ticketPriority.${p}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          label={t("tickets.submit")}
          variant="primary"
          size="lg"
          loading={create.isPending}
          onPress={() => {
            if (!title.trim() || !description.trim()) {
              showToast(t("tickets.missing"), "error");
              return;
            }
            create.mutate({
              category,
              priority,
              title: title.trim(),
              description: description.trim(),
              photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
            });
          }}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
