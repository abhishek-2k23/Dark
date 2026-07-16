import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Badge, Button, Card, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3.5 py-2 active:opacity-80 ${
        active ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      <Text variant="subtitle" color={active ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Inline tower → flat picker shown once an admin starts approving a request. */
function FlatPicker({
  flatId,
  onSelect,
}: {
  flatId: string | null;
  onSelect: (flatId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [towerId, setTowerId] = useState<string | null>(null);
  const towers = trpc.tower.list.useQuery();
  const flats = trpc.flat.list.useQuery(
    { towerId: towerId ?? undefined, limit: 100 },
    { enabled: !!towerId },
  );

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text variant="subtitle" color="primary">
          {t("admin.tower")}
        </Text>
        {towers.isLoading ? (
          <Loading className="py-3" />
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {towers.data?.map((tw) => (
              <Chip
                key={tw.id}
                label={tw.name}
                active={tw.id === towerId}
                onPress={() => {
                  setTowerId(tw.id);
                  onSelect(null);
                }}
              />
            ))}
          </View>
        )}
      </View>

      {towerId && (
        <View className="gap-2">
          <Text variant="subtitle" color="primary">
            {t("admin.flat")}
          </Text>
          {flats.isLoading ? (
            <Loading className="py-3" />
          ) : (flats.data?.items.length ?? 0) === 0 ? (
            <Text variant="bodySmall" color="tertiary">
              {t("admin.noFlats")}
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {flats.data?.items.map((f) => (
                <Chip
                  key={f.id}
                  label={f.flatNumber}
                  active={f.id === flatId}
                  onPress={() => onSelect(f.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * The queue of people asking to join this society. Approving needs a flat —
 * a resident without one can't use visitors, dues, or tickets — so the picker
 * unfolds inline before the final confirm.
 */
export default function JoinRequests() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const showDialog = useUIStore((s) => s.showDialog);
  const utils = trpc.useUtils();

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [flatId, setFlatId] = useState<string | null>(null);

  const q = trpc.joinRequest.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const decide = trpc.joinRequest.decide.useMutation({
    onSuccess: (res) => {
      showToast(
        res.status === "APPROVED" ? t("admin.requestApproved") : t("admin.requestRejected"),
        res.status === "APPROVED" ? "success" : "info",
      );
      setApprovingId(null);
      setFlatId(null);
      void utils.joinRequest.list.invalidate();
      void utils.resident.list.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onReject = (requestId: string, userName: string) => {
    showDialog({
      title: t("admin.rejectRequest"),
      message: t("admin.rejectRequestConfirm", { name: userName }),
      actions: [
        {
          label: t("admin.reject"),
          tone: "danger",
          onPress: () => decide.mutate({ requestId, approve: false }),
        },
        { label: t("common.cancel"), tone: "neutral" },
      ],
    });
  };

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("admin.joinRequests")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={toErrorMessage(q.error, t)} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="person-add-outline"
          title={t("admin.noJoinRequests")}
          body={t("admin.noJoinRequestsBody")}
        />
      ) : (
        <View className="gap-3">
          {items.map((r) => {
            const approving = approvingId === r.id;
            return (
              <Card key={r.id} className="gap-3">
                <View className="flex-row items-center gap-3">
                  <Avatar uri={r.userAvatarUrl} name={r.userName} size={44} />
                  <View className="flex-1 gap-0.5">
                    <Text variant="title" numberOfLines={1}>
                      {r.userName}
                    </Text>
                    <Text variant="bodySmall" color="secondary" numberOfLines={1}>
                      {r.userEmail ?? r.userPhone ?? ""}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {formatDateTime(r.createdAt)}
                    </Text>
                  </View>
                  <Badge
                    label={t("admin.expiresAt", {
                      time: formatDateTime(r.expiresAt),
                    })}
                    tone="warning"
                    size="sm"
                  />
                </View>

                {approving ? (
                  <View className="gap-3">
                    <FlatPicker flatId={flatId} onSelect={setFlatId} />
                    <View className="flex-row gap-2">
                      <Button
                        label={t("common.cancel")}
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        onPress={() => {
                          setApprovingId(null);
                          setFlatId(null);
                        }}
                      />
                      <Button
                        label={t("admin.confirmApprove")}
                        variant="success"
                        size="sm"
                        leftIcon="checkmark-circle-outline"
                        className="flex-1"
                        disabled={!flatId}
                        loading={decide.isPending}
                        onPress={() => {
                          if (!flatId) return;
                          decide.mutate({
                            requestId: r.id,
                            approve: true,
                            flatId,
                          });
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-2">
                    <Button
                      label={t("admin.reject")}
                      variant="outline"
                      size="sm"
                      leftIcon="close-circle-outline"
                      className="flex-1"
                      onPress={() => onReject(r.id, r.userName)}
                    />
                    <Button
                      label={t("admin.approve")}
                      variant="primary"
                      size="sm"
                      leftIcon="person-add-outline"
                      className="flex-1"
                      onPress={() => {
                        setApprovingId(r.id);
                        setFlatId(null);
                      }}
                    />
                  </View>
                )}
              </Card>
            );
          })}

          {q.hasNextPage && (
            <Button
              label={t("common.loadMore")}
              variant="ghost"
              size="sm"
              loading={q.isFetchingNextPage}
              onPress={() => q.fetchNextPage()}
            />
          )}
        </View>
      )}
    </Screen>
  );
}
