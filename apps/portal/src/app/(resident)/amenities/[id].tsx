import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Divider,
  IconCircle,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { formatMoney, toDateString } from "@/utils/format";

/** Bookable one-hour slots, 06:00–22:00. */
const SLOTS = Array.from({ length: 16 }, (_, i) => {
  const h = 6 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

/** Next 7 days as selectable chips. */
function nextDays(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export default function AmenityDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const days = nextDays(7);
  const [date, setDate] = useState<string>(toDateString(days[0]!));
  const [slot, setSlot] = useState<string | null>(null);

  const q = trpc.amenity.list.useQuery();
  const amenity = q.data?.find((a) => a.id === id);

  const book = trpc.amenityBooking.create.useMutation({
    onSuccess: () => {
      showToast(t("amenities.bookedToast"), "success");
      void utils.amenityBooking.myBookings.invalidate();
      router.back();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const isToday = date === toDateString(new Date());
  const nowHour = new Date().getHours();

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={amenity?.name ?? t("amenities.title")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : amenity ? (
        <>
          <Card className="gap-3">
            <View className="flex-row items-center gap-3">
              <IconCircle name="business-outline" tone="accent" size={52} />
              <View className="flex-1 gap-1">
                <Text variant="h3">{amenity.name}</Text>
                <Badge
                  label={
                    amenity.pricePerSlot != null
                      ? t("amenities.perSlot", {
                          price: formatMoney(amenity.pricePerSlot),
                        })
                      : t("amenities.free")
                  }
                  tone={amenity.pricePerSlot != null ? "primary" : "mint"}
                  size="sm"
                />
              </View>
            </View>
            {amenity.description && (
              <Text variant="body" color="secondary">
                {amenity.description}
              </Text>
            )}
            {amenity.rules && (
              <>
                <Divider />
                <View className="gap-1">
                  <Text variant="overline" color="secondary">
                    {t("amenities.rules")}
                  </Text>
                  <Text variant="bodySmall" color="secondary">
                    {amenity.rules}
                  </Text>
                </View>
              </>
            )}
          </Card>

          {/* Date picker */}
          <View className="gap-2">
            <Text variant="label" color="secondary">
              {t("amenities.pickDate")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
              className="-mx-5 px-5"
            >
              {days.map((d) => {
                const ds = toDateString(d);
                const active = ds === date;
                return (
                  <Pressable
                    key={ds}
                    onPress={() => {
                      setDate(ds);
                      setSlot(null);
                    }}
                    className={`w-16 items-center gap-0.5 rounded-2xl border py-3 active:opacity-80 ${
                      active
                        ? "border-primary bg-primary-strong"
                        : "border-border bg-surface"
                    }`}
                  >
                    <Text
                      variant="caption"
                      color={active ? "onPrimary" : "secondary"}
                    >
                      {weekdayFmt.format(d)}
                    </Text>
                    <Text variant="title" color={active ? "onPrimary" : "content"}>
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Slot picker */}
          <View className="gap-2">
            <Text variant="label" color="secondary">
              {t("amenities.pickSlot")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SLOTS.map((s) => {
                const hour = Number(s.slice(0, 2));
                const past = isToday && hour <= nowHour;
                const active = s === slot;
                return (
                  <Pressable
                    key={s}
                    disabled={past}
                    onPress={() => setSlot(s)}
                    className={`w-[22%] grow items-center rounded-xl border py-2.5 active:opacity-80 ${
                      past
                        ? "border-border bg-surface-muted opacity-40"
                        : active
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface"
                    }`}
                  >
                    <Text
                      variant="subtitle"
                      color={active ? "primary" : past ? "tertiary" : "content"}
                    >
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" color="tertiary">
              {t("amenities.slotHint")}
            </Text>
          </View>

          <Button
            label={
              slot
                ? t("amenities.bookCta", { slot })
                : t("amenities.bookCtaDisabled")
            }
            variant="primary"
            size="lg"
            leftIcon="calendar-outline"
            disabled={!slot}
            loading={book.isPending}
            onPress={() => {
              if (!slot) return;
              const endH = Number(slot.slice(0, 2)) + 1;
              book.mutate({
                amenityId: amenity.id,
                date,
                startTime: slot,
                endTime: `${String(endH).padStart(2, "0")}:00`,
              });
            }}
            fullWidth
          />
        </>
      ) : (
        <ErrorState message={t("amenities.notFound")} />
      )}
    </Screen>
  );
}
