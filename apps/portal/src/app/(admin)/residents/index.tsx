import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  Screen,
  SegmentedControl,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

type Status = "ALL" | "ACTIVE" | "INACTIVE";

function ResidentCard({
  resident,
}: {
  resident: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    flatNumber: string;
    towerName: string;
    isPrimaryResident: boolean;
  };
}) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const onSettled = () => void utils.resident.list.invalidate();
  const deactivate = trpc.resident.deactivate.useMutation({
    onSuccess: () => {
      showToast(t("admin.residentDeactivated"), "info");
      onSettled();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const reactivate = trpc.resident.reactivate.useMutation({
    onSuccess: () => {
      showToast(t("admin.residentReactivated"), "success");
      onSettled();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const busy = deactivate.isPending || reactivate.isPending;

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <Avatar uri={resident.avatarUrl} name={resident.name} size={44} />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text variant="title" numberOfLines={1} className="shrink">
              {resident.name}
            </Text>
            {resident.isPrimaryResident && (
              <Badge label={t("common.primary")} tone="primary" size="sm" />
            )}
          </View>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {t("guard.flatLine", {
              tower: resident.towerName,
              flat: resident.flatNumber,
            })}{" "}
            · {resident.email ?? resident.phone ?? ""}
          </Text>
        </View>
        <Badge
          label={resident.isActive ? t("status.active") : t("admin.inactive")}
          tone={resident.isActive ? "success" : "neutral"}
          size="sm"
          uppercase
        />
      </View>
      {resident.isActive ? (
        <Button
          label={t("admin.deactivate")}
          variant="dangerSoft"
          size="sm"
          loading={busy}
          onPress={() => deactivate.mutate({ userId: resident.id })}
        />
      ) : (
        <Button
          label={t("admin.reactivate")}
          variant="secondary"
          size="sm"
          loading={busy}
          onPress={() => reactivate.mutate({ userId: resident.id })}
        />
      )}
    </Card>
  );
}

export default function ResidentsList() {
  const { t } = useTranslation();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("ALL");
  const [search, setSearch] = useState("");

  const q = trpc.resident.list.useInfiniteQuery(
    { status, search: search.trim() || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("admin.residents")}
        right={
          <Button
            label={t("admin.invite")}
            variant="secondary"
            size="sm"
            leftIcon="person-add-outline"
            onPress={() => router.push("/(admin)/residents/invite")}
          />
        }
      />

      <Input
        leftIcon="search-outline"
        placeholder={t("admin.searchResidents")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <SegmentedControl
        value={status}
        onChange={setStatus}
        options={[
          { value: "ALL", label: t("visitors.all") },
          { value: "ACTIVE", label: t("status.active") },
          { value: "INACTIVE", label: t("admin.inactive") },
        ]}
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="people-outline" title={t("admin.noResidents")} />
      ) : (
        <View className="gap-3">
          {items.map((r) => (
            <ResidentCard key={r.id} resident={r} />
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
