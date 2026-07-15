import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  IconCircle,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

export default function TicketDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");

  const q = trpc.ticket.get.useQuery({ ticketId: id ?? "" }, { enabled: !!id });

  const comment = trpc.ticket.addComment.useMutation({
    onSuccess: () => {
      setMessage("");
      void utils.ticket.get.invalidate({ ticketId: id ?? "" });
      void utils.ticket.list.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const tk = q.data;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("tickets.detailTitle")} />

      {q.isLoading ? (
        <Loading variant="detail" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : tk ? (
        <>
          <Card className="gap-3">
            <View className="flex-row items-start gap-3">
              <IconCircle
                name={ticketCategoryIcon[tk.category] ?? "build-outline"}
                tone="primary"
              />
              <View className="flex-1 gap-1">
                <Text variant="h3">{tk.title}</Text>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge
                    label={t(`enums.ticketStatus.${tk.status}`)}
                    tone={ticketStatusTone[tk.status] ?? "neutral"}
                    uppercase
                    size="sm"
                  />
                  <Badge
                    label={t(`enums.ticketPriority.${tk.priority}`)}
                    tone={tk.priority === "HIGH" ? "danger" : "neutral"}
                    size="sm"
                  />
                </View>
              </View>
            </View>
            <Divider />
            <Text variant="body" color="secondary">
              {tk.description}
            </Text>
            <Text variant="caption" color="tertiary">
              {t("tickets.raisedOn", { date: formatDateTime(tk.createdAt) })}
              {tk.assignedTo
                ? ` · ${t("tickets.assignedTo", { name: tk.assignedTo.name })}`
                : ""}
            </Text>
          </Card>

          {/* Comment thread */}
          <Text variant="label" color="secondary">
            {t("tickets.thread")}
          </Text>
          {tk.comments.length === 0 ? (
            <Text variant="bodySmall" color="tertiary" align="center" className="py-4">
              {t("tickets.noComments")}
            </Text>
          ) : (
            <View className="gap-3">
              {tk.comments.map((c) => (
                <Card key={c.id} variant="filled" className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <Avatar name={c.author.name} size={28} />
                    <Text variant="subtitle" className="flex-1" numberOfLines={1}>
                      {c.author.name}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {formatDateTime(c.createdAt)}
                    </Text>
                  </View>
                  <Text variant="body">{c.message}</Text>
                </Card>
              ))}
            </View>
          )}

          <View className="gap-3">
            <Input
              placeholder={t("tickets.commentPlaceholder")}
              value={message}
              onChangeText={setMessage}
              multiline
              style={{ minHeight: 60, textAlignVertical: "top" }}
            />
            <Button
              label={t("tickets.addComment")}
              variant="primary"
              leftIcon="send-outline"
              loading={comment.isPending}
              onPress={() => {
                if (!message.trim()) return;
                comment.mutate({ ticketId: tk.id, message: message.trim() });
              }}
              fullWidth
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
