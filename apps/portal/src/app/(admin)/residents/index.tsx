import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { TabPage } from "@/components/TabPage";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Screen,
  SwipeTabs,
  Text,
  type SegmentOption,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";

type Status = "ALL" | "ACTIVE" | "INACTIVE";

interface ResidentCardData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  flatNumber: string;
  towerName: string;
  isPrimaryResident: boolean;
}

/**
 * One resident as a grid tile: photo on top, then name, contact, flat and
 * status. Sized to sit two-up, so everything is centred and clipped to one line
 * — a long name must not make one tile taller than the one beside it.
 */
function ResidentTile({
  resident,
  onPress,
}: {
  resident: ResidentCardData;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      onPress={onPress}
      variant="elevated"
      className="flex-1 items-center gap-2 px-3 py-4"
    >
      <Avatar
        uri={resident.avatarUrl}
        name={resident.name}
        size={64}
        ring={resident.isPrimaryResident}
      />

      <View className="w-full items-center gap-0.5">
        <Text variant="title" numberOfLines={1} align="center">
          {resident.name}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1} align="center">
          {resident.email ?? resident.phone ?? "—"}
        </Text>
      </View>

      <View className="flex-row items-center gap-1">
        <Icon name="business-outline" size={13} color="secondary" />
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {t("guard.flatLine", { tower: resident.towerName, flat: resident.flatNumber })}
        </Text>
      </View>

      <Badge
        label={resident.isActive ? t("status.active") : t("admin.inactive")}
        tone={resident.isActive ? "success" : "neutral"}
        size="sm"
        uppercase
      />
    </Card>
  );
}

/** Residents for one status filter (sharing the screen's search term). */
function ResidentGrid({ status, search }: { status: Status; search: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  const q = trpc.resident.list.useInfiniteQuery(
    { status, search: search.trim() || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return <EmptyState icon="people-outline" title={t("admin.noResidents")} />;

  // Chunked into pairs rather than using FlatList numColumns: these pages
  // already live inside a scrolling TabPage, and nesting a virtualised list in
  // a ScrollView is the classic RN warning.
  const rows: ResidentCardData[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  return (
    <>
      {rows.map((row) => (
        <View key={row[0]!.id} className="flex-row gap-3">
          {row.map((resident) => (
            <ResidentTile
              key={resident.id}
              resident={resident}
              onPress={() =>
                router.push({
                  pathname: "/(admin)/residents/[userId]",
                  params: { userId: resident.id },
                })
              }
            />
          ))}
          {/* Keeps a lone trailing tile at half width instead of stretching. */}
          {row.length === 1 && <View className="flex-1" />}
        </View>
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
    </>
  );
}

export default function ResidentsList() {
  const { t } = useTranslation();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("ALL");
  const [search, setSearch] = useState("");

  const options: SegmentOption<Status>[] = [
    { value: "ALL", label: t("visitors.all") },
    { value: "ACTIVE", label: t("status.active") },
    { value: "INACTIVE", label: t("admin.inactive") },
  ];

  return (
    <Screen padded={false}>
      <View className="gap-4 px-5">
        <StackHeader
          title={t("admin.residents")}
          right={
            <View className="flex-row gap-2">
              <Button
                label={t("admin.import.short")}
                variant="outline"
                size="sm"
                leftIcon="cloud-upload-outline"
                onPress={() => router.push("/(admin)/residents/import")}
              />
              <Button
                label={t("admin.invite")}
                variant="secondary"
                size="sm"
                leftIcon="person-add-outline"
                onPress={() => router.push("/(admin)/residents/invite")}
              />
            </View>
          }
        />

        <Input
          leftIcon="search-outline"
          placeholder={t("admin.searchResidents")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <SwipeTabs
        value={status}
        onChange={setStatus}
        tabsClassName="mx-5 mb-1 mt-3"
        options={options}
      >
        <TabPage>
          <ResidentGrid status="ALL" search={search} />
        </TabPage>
        <TabPage>
          <ResidentGrid status="ACTIVE" search={search} />
        </TabPage>
        <TabPage>
          <ResidentGrid status="INACTIVE" search={search} />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
