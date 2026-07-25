import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { BulkImport } from "@/components/residents/BulkImport";
import { SingleInvite } from "@/components/residents/SingleInvite";
import { StackHeader } from "@/components/StackHeader";
import { TabPage } from "@/components/TabPage";
import { Screen, SwipeTabs, type SegmentOption } from "@/components/ui";

type Mode = "SINGLE" | "BULK";

/**
 * Adding residents, both ways, behind one entry point.
 *
 * These were two buttons in the residents header, which made bulk import look
 * like a separate feature rather than the other way of doing the same job. An
 * admin setting up a society wants "add residents" and then to choose whether
 * that is one person or a spreadsheet.
 */
export default function AddResidents() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("SINGLE");

  const options: SegmentOption<Mode>[] = [
    { value: "SINGLE", label: t("admin.addOne") },
    { value: "BULK", label: t("admin.addBulk") },
  ];

  return (
    <Screen padded={false}>
      <View className="px-5">
        <StackHeader title={t("admin.addResidents")} />
      </View>

      <SwipeTabs
        value={mode}
        onChange={setMode}
        tabsClassName="mx-5 mb-1 mt-2"
        options={options}
      >
        <TabPage>
          <SingleInvite />
        </TabPage>
        <TabPage>
          <BulkImport />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
