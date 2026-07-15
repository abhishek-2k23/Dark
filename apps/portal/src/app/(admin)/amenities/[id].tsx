import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { bookingStatusTone } from "@/utils/domain";
import { toErrorMessage } from "@/utils/errors";
import { formatClock, formatDate } from "@/utils/format";

export default function AmenityCalendar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const amenityId = id ?? "";

  const q = trpc.amenityBooking.calendar.useQuery(
    { amenityId },
    { enabled: !!id },
  );

  // Group bookings by date, preserving the server's date/time ordering.
  const groups: { date: string; items: NonNullable<typeof q.data> }[] = [];
  for (const b of q.data ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.date === b.date) last.items.push(b);
    else groups.push({ date: b.date, items: [b] });
  }

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("admin.bookingCalendar")}
        right={
          <Button
            label={t("admin.edit")}
            variant="secondary"
            size="sm"
            leftIcon="create-outline"
            onPress={() => router.push(`/(admin)/amenities/create?id=${amenityId}`)}
          />
        }
      />

      {q.isLoading ? (
        <Loading variant="detail" />
      ) : q.error ? (
        <ErrorState message={toErrorMessage(q.error, t)} onRetry={q.refetch} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={t("admin.noBookings")}
          body={t("admin.noBookingsBody")}
        />
      ) : (
        <View className="gap-5">
          {groups.map((g) => (
            <View key={g.date} className="gap-2">
              <Text variant="label" color="secondary">
                {formatDate(g.date)}
              </Text>
              {g.items.map((b) => (
                <Card key={b.id} className="flex-row items-center gap-3">
                  <View className="items-center">
                    <Text variant="subtitle" color="primary">
                      {formatClock(b.startTime)}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {formatClock(b.endTime)}
                    </Text>
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text variant="title" numberOfLines={1}>
                      {b.bookedBy.name}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t("admin.flatShort", { flat: b.bookedBy.flatNumber })}
                    </Text>
                  </View>
                  <Badge
                    label={t(`enums.bookingStatus.${b.status}`)}
                    tone={bookingStatusTone[b.status] ?? "neutral"}
                    size="sm"
                    uppercase
                  />
                </Card>
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
