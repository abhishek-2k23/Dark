import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, View } from "react-native";

import { PhotoGrid } from "@/components/media";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Icon, Input, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

export default function CreateAmenity() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const isEdit = !!id;

  const list = trpc.amenity.list.useQuery(undefined, { enabled: isEdit });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [price, setPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isEdit || loaded) return;
    const a = list.data?.find((x) => x.id === id);
    if (a) {
      setName(a.name);
      setDescription(a.description ?? "");
      setRules(a.rules ?? "");
      setPrice(a.pricePerSlot != null ? String(a.pricePerSlot) : "");
      setIsActive(a.isActive);
      setPhotoUrls(a.photoUrls);
      setLoaded(true);
    }
  }, [list.data, id, isEdit, loaded]);

  const afterSave = () => {
    void utils.amenity.list.invalidate();
    router.back();
  };
  const create = trpc.amenity.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.amenityCreated"), "success");
      afterSave();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });
  const update = trpc.amenity.update.useMutation({
    onSuccess: () => {
      showToast(t("admin.amenitySaved"), "success");
      afterSave();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });
  const del = trpc.amenity.delete.useMutation({
    onSuccess: () => {
      showToast(t("admin.amenityDeleted"), "success");
      void utils.amenity.list.invalidate();
      router.replace("/(admin)/amenities");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });
  const busy = create.isPending || update.isPending || del.isPending;

  const onDelete = () => {
    Alert.alert(t("admin.deleteAmenity"), t("admin.deleteAmenityConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("admin.confirmDelete"),
        style: "destructive",
        onPress: () => del.mutate({ amenityId: id! }),
      },
    ]);
  };

  const onSubmit = () => {
    if (!name.trim()) {
      showToast(t("admin.amenityNameRequired"), "error");
      return;
    }
    const priceNum = price.trim() ? Number(price) : undefined;
    if (priceNum != null && (Number.isNaN(priceNum) || priceNum < 0)) {
      showToast(t("admin.badPrice"), "error");
      return;
    }
    if (isEdit) {
      update.mutate({
        amenityId: id!,
        name: name.trim(),
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        pricePerSlot: priceNum ?? null,
        isActive,
        photoUrls,
      });
    } else {
      create.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        ...(priceNum != null ? { pricePerSlot: priceNum } : {}),
        isActive,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      });
    }
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={isEdit ? t("admin.editAmenity") : t("admin.newAmenity")} />

      <Card className="gap-4">
        {/* Residents book what they can see — an amenity with no photos reads
            as an empty card in the list. */}
        <PhotoGrid
          value={photoUrls}
          onChange={setPhotoUrls}
          kind="AMENITY"
          label={t("admin.amenityPhotos")}
          max={5}
        />
        <Input
          label={t("admin.amenityName")}
          leftIcon="tennisball-outline"
          placeholder={t("admin.amenityNamePlaceholder")}
          value={name}
          onChangeText={setName}
        />
        <Input
          label={t("admin.description")}
          labelHint={t("common.optional")}
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <Input
          label={t("amenities.rules")}
          labelHint={t("common.optional")}
          value={rules}
          onChangeText={setRules}
          multiline
          style={{ minHeight: 70, textAlignVertical: "top" }}
        />
        <Input
          label={t("admin.pricePerSlot")}
          labelHint={t("common.optional")}
          leftIcon="cash-outline"
          keyboardType="number-pad"
          placeholder={t("admin.freeIfBlank")}
          value={price}
          onChangeText={setPrice}
        />

        <Pressable
          onPress={() => setIsActive((a) => !a)}
          className="flex-row items-center justify-between active:opacity-80"
        >
          <Text variant="subtitle">{t("admin.openForBooking")}</Text>
          <Icon
            name={isActive ? "toggle" : "toggle-outline"}
            size={30}
            color={isActive ? "primary" : "tertiary"}
          />
        </Pressable>

        <Button
          label={isEdit ? t("common.save") : t("admin.createAmenity")}
          variant="primary"
          size="lg"
          loading={create.isPending || update.isPending}
          disabled={busy}
          onPress={onSubmit}
          fullWidth
        />

        {isEdit && (
          <Button
            label={t("admin.deleteAmenity")}
            variant="danger"
            size="lg"
            leftIcon="trash-outline"
            loading={del.isPending}
            disabled={busy}
            onPress={onDelete}
            fullWidth
          />
        )}
      </Card>
    </Screen>
  );
}
