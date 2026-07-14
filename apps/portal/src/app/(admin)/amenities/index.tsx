import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { toErrorMessage } from "@/utils/errors";
import { formatMoney } from "@/utils/format";

export default function ManageAmenities() {
  const { t } = useTranslation();
  const router = useRouter();
  const q = trpc.amenity.list.useQuery();

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("amenities.title")}
        right={
          <Button
            label={t("admin.newAmenity")}
            variant="secondary"
            size="sm"
            leftIcon="add"
            onPress={() => router.push("/(admin)/amenities/create")}
          />
        }
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={toErrorMessage(q.error, t)} onRetry={q.refetch} />
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="tennisball-outline"
          title={t("amenities.empty")}
          body={t("admin.noAmenitiesBody")}
        />
      ) : (
        <View className="gap-3">
          {q.data?.map((a) => (
            <Card
              key={a.id}
              onPress={() => router.push(`/(admin)/amenities/${a.id}`)}
              className="flex-row items-center gap-3"
            >
              <IconCircle name="tennisball-outline" tone="peach" size={44} />
              <View className="flex-1 gap-0.5">
                <Text variant="title" numberOfLines={1}>
                  {a.name}
                </Text>
                <Text variant="caption" color="secondary">
                  {a.pricePerSlot != null
                    ? t("amenities.perSlot", { price: formatMoney(a.pricePerSlot) })
                    : t("amenities.free")}
                </Text>
              </View>
              <Badge
                label={a.isActive ? t("status.active") : t("admin.inactive")}
                tone={a.isActive ? "success" : "neutral"}
                size="sm"
                uppercase
              />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
