import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { confirmAction } from "@/utils/confirm";
import { noticeCategoryIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

export default function ManageNotices() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const q = trpc.notice.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const remove = trpc.notice.delete.useMutation({
    onSuccess: () => {
      showToast(t("admin.noticeDeleted"), "info");
      void utils.notice.list.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("notices.title")}
        right={
          <Button
            label={t("admin.newNotice")}
            variant="secondary"
            size="sm"
            leftIcon="add"
            onPress={() => router.push("/(admin)/notices/create")}
          />
        }
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="megaphone-outline" title={t("notices.empty")} />
      ) : (
        <View className="gap-3">
          {items.map((n) => (
            <Card key={n.id} className="gap-3">
              <View className="flex-row items-start gap-3">
                <IconCircle
                  name={noticeCategoryIcon[n.category] ?? "megaphone-outline"}
                  tone="primary"
                  size={42}
                />
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-1.5">
                    {n.isPinned && (
                      <Icon name="pin" size={14} color="primary" />
                    )}
                    <Text variant="title" numberOfLines={1} className="shrink">
                      {n.title}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Badge
                      label={t(`enums.noticeCategory.${n.category}`)}
                      tone="neutral"
                      size="sm"
                    />
                    <Badge
                      label={
                        n.isPublished ? t("status.active") : t("status.scheduled")
                      }
                      tone={n.isPublished ? "success" : "warning"}
                      size="sm"
                      uppercase
                    />
                  </View>
                  <Text variant="caption" color="tertiary">
                    {n.scheduledAt && !n.isPublished
                      ? t("admin.scheduledFor", {
                          date: formatDateTime(n.scheduledAt),
                        })
                      : formatDateTime(n.createdAt)}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <Button
                  label={t("admin.edit")}
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onPress={() =>
                    router.push(`/(admin)/notices/create?id=${n.id}`)
                  }
                />
                <Button
                  label={t("admin.delete")}
                  variant="dangerSoft"
                  size="sm"
                  className="flex-1"
                  loading={remove.isPending && remove.variables?.noticeId === n.id}
                  onPress={() =>
                    confirmAction({
                      title: t("admin.deleteNoticeConfirmTitle"),
                      message: t("admin.deleteNoticeConfirmMessage"),
                      confirmLabel: t("admin.delete"),
                      cancelLabel: t("common.cancel"),
                      onConfirm: () => remove.mutate({ noticeId: n.id }),
                    })
                  }
                />
              </View>
            </Card>
          ))}
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
