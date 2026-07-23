import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { PhotoGrid, PhotoStrip } from "@/components/media";
import { TicketStub } from "@/components/TicketStub";
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

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type Status = (typeof STATUSES)[number];

export default function AdminTicketDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");
  const [commentPhotos, setCommentPhotos] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const ticketId = id ?? "";
  const q = trpc.ticket.get.useQuery({ ticketId }, { enabled: !!id });
  const staff = trpc.staff.list.useQuery(undefined, { enabled: assigning });

  const refresh = () => {
    void utils.ticket.get.invalidate({ ticketId });
    void utils.ticket.list.invalidate();
  };
  const updateStatus = trpc.ticket.updateStatus.useMutation({
    onSuccess: () => {
      showToast(t("admin.statusUpdated"), "success");
      refresh();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const assign = trpc.ticket.assign.useMutation({
    onSuccess: () => {
      showToast(t("admin.assigned"), "success");
      setAssigning(false);
      refresh();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const comment = trpc.ticket.addComment.useMutation({
    onSuccess: () => {
      setMessage("");
      setCommentPhotos([]);
      refresh();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const tk = q.data;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("admin.complaint")} />

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
            <PhotoStrip urls={tk.photoUrls} />
            <TicketStub referenceCode={tk.referenceCode} />
            <Text variant="caption" color="tertiary">
              {t("admin.raisedByFlat", {
                name: tk.raisedBy.name,
                tower: tk.towerName,
                flat: tk.flatNumber,
              })}{" "}
              · {formatDateTime(tk.createdAt)}
            </Text>
          </Card>

          {/* Status control */}
          <View className="gap-2">
            <Text variant="label" color="secondary">
              {t("admin.setStatus")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {STATUSES.map((s) => {
                const active = s === tk.status;
                return (
                  <Pressable
                    key={s}
                    disabled={updateStatus.isPending || active}
                    onPress={() => updateStatus.mutate({ ticketId: tk.id, status: s })}
                    className={`rounded-full border px-3.5 py-2 active:opacity-80 ${
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface"
                    }`}
                  >
                    <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                      {t(`enums.ticketStatus.${s}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Assignment */}
          <View className="gap-2">
            <Text variant="label" color="secondary">
              {t("admin.assignment")}
            </Text>
            <Card variant="filled" className="gap-3">
              <View className="flex-row items-center gap-3">
                <IconCircle
                  name={tk.assignedTo ? "person-outline" : "person-add-outline"}
                  tone={tk.assignedTo ? "success" : "neutral"}
                  size={38}
                />
                <Text variant="subtitle" className="flex-1">
                  {tk.assignedTo ? tk.assignedTo.name : "—"}
                </Text>
                <Button
                  label={tk.assignedTo ? t("admin.reassign") : t("admin.assign")}
                  variant="secondary"
                  size="sm"
                  onPress={() => setAssigning((a) => !a)}
                />
              </View>
              {assigning &&
                (staff.isLoading ? (
                  <Loading className="py-3" />
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {staff.data?.map((m) => (
                      <Pressable
                        key={m.id}
                        disabled={assign.isPending}
                        onPress={() =>
                          assign.mutate({ ticketId: tk.id, assigneeId: m.id })
                        }
                        className="rounded-full border border-border bg-surface px-3.5 py-2 active:opacity-80"
                      >
                        <Text variant="caption" color="secondary">
                          {m.name} · {t(`enums.staffRole.${m.role}`)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
            </Card>
          </View>

          {/* Comment thread */}
          <Text variant="label" color="secondary">
            {t("tickets.thread")}
          </Text>
          {tk.comments.length === 0 ? (
            <Text variant="bodySmall" color="tertiary" align="center" className="py-2">
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
                  <PhotoStrip urls={c.photoUrls} size={64} />
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
            <PhotoGrid
              value={commentPhotos}
              onChange={setCommentPhotos}
              kind="TICKET"
              max={3}
            />
            <Button
              label={t("tickets.addComment")}
              variant="primary"
              leftIcon="send-outline"
              loading={comment.isPending}
              onPress={() => {
                if (!message.trim()) return;
                comment.mutate({
                  ticketId: tk.id,
                  message: message.trim(),
                  photoUrls: commentPhotos.length > 0 ? commentPhotos : undefined,
                });
              }}
              fullWidth
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
