import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

const FLAT_TYPES = [
  "ONE_RK",
  "ONE_BHK",
  "TWO_BHK",
  "THREE_BHK",
  "FOUR_BHK",
  "OTHER",
] as const;
type FlatType = (typeof FLAT_TYPES)[number];

/** Inline add-flat form for one tower. */
function AddFlatForm({ towerId, onDone }: { towerId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [flatNumber, setFlatNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [type, setType] = useState<FlatType>("TWO_BHK");

  const create = trpc.flat.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.flatAdded"), "success");
      void utils.flat.list.invalidate();
      void utils.tower.list.invalidate();
      onDone();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Card variant="filled" className="gap-3">
      <Input
        label={t("admin.flatNumber")}
        placeholder="A-101"
        autoCapitalize="characters"
        value={flatNumber}
        onChangeText={setFlatNumber}
      />
      <Input
        label={t("admin.floor")}
        placeholder="1"
        keyboardType="number-pad"
        value={floor}
        onChangeText={setFloor}
      />
      <View className="flex-row flex-wrap gap-2">
        {FLAT_TYPES.map((ft) => {
          const active = ft === type;
          return (
            <Pressable
              key={ft}
              onPress={() => setType(ft)}
              className={`rounded-full border px-3 py-1.5 active:opacity-80 ${
                active ? "border-primary bg-primary-soft" : "border-border bg-surface"
              }`}
            >
              <Text variant="caption" color={active ? "primary" : "secondary"}>
                {t(`enums.flatType.${ft}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={t("admin.addFlat")}
        variant="primary"
        size="sm"
        loading={create.isPending}
        onPress={() => {
          const floorNum = Number(floor);
          if (!flatNumber.trim() || Number.isNaN(floorNum)) {
            showToast(t("admin.flatMissing"), "error");
            return;
          }
          create.mutate({
            towerId,
            flatNumber: flatNumber.trim(),
            floor: floorNum,
            type,
          });
        }}
        fullWidth
      />
    </Card>
  );
}

/** One tower card that expands to reveal its flats + an add-flat form. */
function TowerCard({
  tower,
}: {
  tower: { id: string; name: string; flatCount: number };
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const flats = trpc.flat.list.useQuery(
    { towerId: tower.id, limit: 100 },
    { enabled: open },
  );

  return (
    <Card className="gap-3">
      <Pressable
        className="flex-row items-center gap-3 active:opacity-80"
        onPress={() => setOpen((o) => !o)}
      >
        <IconCircle name="business-outline" tone="primary" size={44} />
        <View className="flex-1">
          <Text variant="title">{t("admin.towerName", { name: tower.name })}</Text>
          <Text variant="caption" color="secondary">
            {t("admin.flatCount", { count: tower.flatCount })}
          </Text>
        </View>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="tertiary" />
      </Pressable>

      {open && (
        <View className="gap-2">
          {flats.isLoading ? (
            <Loading className="py-4" />
          ) : (flats.data?.items.length ?? 0) === 0 ? (
            <Text variant="bodySmall" color="tertiary" align="center" className="py-2">
              {t("admin.noFlats")}
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {flats.data?.items.map((f) => (
                <Badge
                  key={f.id}
                  label={`${f.flatNumber} · ${t(`enums.flatType.${f.type}`)}`}
                  tone="neutral"
                  size="sm"
                />
              ))}
            </View>
          )}
          {adding ? (
            <AddFlatForm towerId={tower.id} onDone={() => setAdding(false)} />
          ) : (
            <Button
              label={t("admin.addFlat")}
              variant="secondary"
              size="sm"
              leftIcon="add"
              onPress={() => setAdding(true)}
            />
          )}
        </View>
      )}
    </Card>
  );
}

export default function ManageProperty() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const q = trpc.tower.list.useQuery();
  const [towerName, setTowerName] = useState("");
  const [adding, setAdding] = useState(false);

  const create = trpc.tower.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.towerAdded"), "success");
      setTowerName("");
      setAdding(false);
      void utils.tower.list.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("admin.property")}
        right={
          <Button
            label={t("admin.addTower")}
            variant="secondary"
            size="sm"
            leftIcon="add"
            onPress={() => setAdding((a) => !a)}
          />
        }
      />

      {adding && (
        <Card className="gap-3">
          <Input
            label={t("admin.towerLabel")}
            placeholder="A"
            autoCapitalize="characters"
            value={towerName}
            onChangeText={setTowerName}
          />
          <Button
            label={t("admin.createTower")}
            variant="primary"
            size="sm"
            loading={create.isPending}
            onPress={() => {
              if (!towerName.trim()) {
                showToast(t("admin.towerMissing"), "error");
                return;
              }
              create.mutate({ name: towerName.trim() });
            }}
            fullWidth
          />
        </Card>
      )}

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="business-outline"
          title={t("admin.noTowers")}
          body={t("admin.noTowersBody")}
        />
      ) : (
        <View className="gap-3">
          {q.data?.map((tw) => (
            <TowerCard key={tw.id} tower={tw} />
          ))}
        </View>
      )}
    </Screen>
  );
}
