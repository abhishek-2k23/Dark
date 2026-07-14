import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Input, Screen } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

export default function EditSociety() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const q = trpc.society.get.useQuery();

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (q.data) {
      setForm({
        name: q.data.name,
        address: q.data.address,
        city: q.data.city,
        state: q.data.state,
        pincode: q.data.pincode,
      });
    }
  }, [q.data]);

  const update = trpc.society.update.useMutation({
    onSuccess: () => {
      showToast(t("admin.societySaved"), "success");
      void utils.society.get.invalidate();
      void utils.profile.me.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("admin.societyDetails")} />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : (
        <Card className="gap-4">
          <Input
            label={t("admin.societyName")}
            leftIcon="business-outline"
            value={form.name}
            onChangeText={set("name")}
          />
          <Input
            label={t("admin.address")}
            leftIcon="location-outline"
            value={form.address}
            onChangeText={set("address")}
          />
          <Input label={t("admin.city")} value={form.city} onChangeText={set("city")} />
          <Input label={t("admin.state")} value={form.state} onChangeText={set("state")} />
          <Input
            label={t("admin.pincode")}
            keyboardType="number-pad"
            value={form.pincode}
            onChangeText={set("pincode")}
          />
          <Button
            label={t("common.save")}
            variant="primary"
            size="lg"
            loading={update.isPending}
            onPress={() => {
              if (!form.name.trim()) {
                showToast(t("admin.societyNameRequired"), "error");
                return;
              }
              update.mutate({
                name: form.name.trim(),
                address: form.address.trim(),
                city: form.city.trim(),
                state: form.state.trim(),
                pincode: form.pincode.trim(),
              });
            }}
            fullWidth
          />
        </Card>
      )}
    </Screen>
  );
}
