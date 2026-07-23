import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { TabPage } from "@/components/TabPage";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  SwipeTabs,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { confirmAction } from "@/utils/confirm";
import { bookingStatusTone } from "@/utils/domain";
import { formatClock, formatDate, formatMoney } from "@/utils/format";

function AmenityList() {
  const { t } = useTranslation();
  const router = useRouter();
  const q = trpc.amenity.list.useQuery();

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  const items = (q.data ?? []).filter((a) => a.isActive);
  if (items.length === 0)
    return <EmptyState icon="business-outline" title={t("amenities.empty")} />;

  return (
    <View className="gap-3">
      {items.map((a) => (
        <Card
          key={a.id}
          onPress={() => router.push(`/(resident)/amenities/${a.id}`)}
          className="flex-row items-center gap-3"
        >
          <IconCircle name="business-outline" tone="accent" size={48} />
          <View className="flex-1 gap-0.5">
            <Text variant="title">{a.name}</Text>
            {a.description && (
              <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                {a.description}
              </Text>
            )}
          </View>
          <Badge
            label={
              a.pricePerSlot != null
                ? formatMoney(a.pricePerSlot)
                : t("amenities.free")
            }
            tone={a.pricePerSlot != null ? "primary" : "mint"}
            size="sm"
          />
        </Card>
      ))}
    </View>
  );
}

function MyBookings() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const q = trpc.amenityBooking.myBookings.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const cancel = trpc.amenityBooking.cancel.useMutation({
    onSuccess: () => {
      showToast(t("amenities.cancelledToast"), "info");
      void utils.amenityBooking.myBookings.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return <EmptyState icon="calendar-outline" title={t("amenities.noBookings")} />;

  return (
    <View className="gap-3">
      {items.map((b) => {
        const upcoming =
          b.status === "BOOKED" && new Date(`${b.date}T${b.endTime}:00`) > new Date();
        return (
          <Card key={b.id} className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-0.5">
                <Text variant="title">{b.amenityName}</Text>
                <Text variant="bodySmall" color="secondary">
                  {formatDate(b.date)} · {formatClock(b.startTime)}–
                  {formatClock(b.endTime)}
                </Text>
              </View>
              <Badge
                label={t(`enums.bookingStatus.${b.status}`)}
                tone={bookingStatusTone[b.status] ?? "neutral"}
                uppercase
                size="sm"
              />
            </View>
            {upcoming && (
              <Button
                label={t("amenities.cancelBooking")}
                variant="dangerSoft"
                size="sm"
                loading={cancel.isPending}
                onPress={() =>
                  confirmAction({
                    title: t("amenities.cancelConfirmTitle"),
                    message: t("amenities.cancelConfirmMessage"),
                    confirmLabel: t("amenities.cancelBooking"),
                    cancelLabel: t("common.keep"),
                    onConfirm: () => cancel.mutate({ bookingId: b.id }),
                  })
                }
              />
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
  );
}

export default function AmenitiesScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"browse" | "mine">("browse");

  return (
    <Screen padded={false}>
      <View className="px-5">
        <StackHeader title={t("amenities.title")} />
      </View>
      <SwipeTabs
        value={tab}
        onChange={setTab}
        tabsClassName="mx-5 mb-1 mt-2"
        options={[
          { value: "browse", label: t("amenities.browse") },
          { value: "mine", label: t("amenities.mine") },
        ]}
      >
        <TabPage>
          <AmenityList />
        </TabPage>
        <TabPage>
          <MyBookings />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
