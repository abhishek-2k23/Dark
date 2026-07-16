import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { AvatarPicker } from "@/components/media";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  Input,
  PhoneInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { serviceCategoryIcon } from "@/utils/domain";

const CATEGORIES = ["MAID", "ELECTRICIAN", "PLUMBER", "DRIVER", "OTHER"] as const;
type Category = (typeof CATEGORIES)[number];

function AddProviderForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<Category>("MAID");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const create = trpc.serviceProvider.create.useMutation({
    onSuccess: () => {
      showToast(t("admin.providerAdded"), "success");
      void utils.serviceProvider.list.invalidate();
      onDone();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Card className="gap-3">
      {/* A face turns the directory from a phone list into people the
          household will actually recognise at the door. */}
      <AvatarPicker
        value={photoUrl}
        onChange={setPhotoUrl}
        name={name}
        size={72}
        label={t("admin.providerPhotoHint")}
      />
      <Input
        label={t("signup.name")}
        leftIcon="person-outline"
        value={name}
        onChangeText={setName}
      />
      <PhoneInput
        label={t("directory.phoneLabel")}
        leftIcon="call-outline"
        placeholder="9876543210"
        value={phone}
        onChangeText={setPhone}
      />
      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              className={`rounded-full border px-3 py-1.5 active:opacity-80 ${
                active ? "border-primary bg-primary-soft" : "border-border bg-surface"
              }`}
            >
              <Text variant="caption" color={active ? "primary" : "secondary"}>
                {t(`enums.serviceCategory.${c}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={t("admin.addProvider")}
        variant="primary"
        size="sm"
        loading={create.isPending}
        onPress={() => {
          if (!name.trim() || phone.trim().length < 8) {
            showToast(t("admin.providerMissing"), "error");
            return;
          }
          create.mutate({
            name: name.trim(),
            phone: phone.trim(),
            category,
            photoUrl: photoUrl ?? undefined,
          });
        }}
        fullWidth
      />
    </Card>
  );
}

function ProviderCard({
  provider,
}: {
  provider: {
    id: string;
    name: string;
    category: string;
    phone: string;
    isVerified: boolean;
  };
}) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const onSettled = () => void utils.serviceProvider.list.invalidate();

  const update = trpc.serviceProvider.update.useMutation({
    onSuccess: onSettled,
    onError: (e) => showToast(e.message, "error"),
  });
  const remove = trpc.serviceProvider.delete.useMutation({
    onSuccess: () => {
      showToast(t("admin.providerRemoved"), "info");
      onSettled();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconCircle
          name={serviceCategoryIcon[provider.category] ?? "briefcase-outline"}
          tone="primary"
          size={44}
        />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text variant="title" numberOfLines={1} className="shrink">
              {provider.name}
            </Text>
            {provider.isVerified && (
              <Icon name="checkmark-circle" size={16} color="success" />
            )}
          </View>
          <Text variant="caption" color="secondary">
            {t(`enums.serviceCategory.${provider.category}`)} · {provider.phone}
          </Text>
        </View>
        <Badge
          label={
            provider.isVerified ? t("admin.verified") : t("admin.unverified")
          }
          tone={provider.isVerified ? "success" : "neutral"}
          size="sm"
        />
      </View>
      <View className="flex-row gap-2">
        <Button
          label={provider.isVerified ? t("admin.unverify") : t("admin.verify")}
          variant="secondary"
          size="sm"
          className="flex-1"
          loading={update.isPending}
          onPress={() =>
            update.mutate({
              serviceProviderId: provider.id,
              isVerified: !provider.isVerified,
            })
          }
        />
        <Button
          label={t("admin.remove")}
          variant="dangerSoft"
          size="sm"
          className="flex-1"
          loading={remove.isPending}
          onPress={() => remove.mutate({ serviceProviderId: provider.id })}
        />
      </View>
    </Card>
  );
}

export default function ManageDirectory() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const q = trpc.serviceProvider.list.useQuery({});

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("directory.title")}
        right={
          <Button
            label={t("admin.add")}
            variant="secondary"
            size="sm"
            leftIcon="add"
            onPress={() => setAdding((a) => !a)}
          />
        }
      />

      {adding && <AddProviderForm onDone={() => setAdding(false)} />}

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t("admin.noProviders")}
          body={t("admin.noProvidersBody")}
        />
      ) : (
        <View className="gap-3">
          {q.data?.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </View>
      )}
    </Screen>
  );
}
