import type { ReactNode } from "react";
import { ScrollView } from "react-native";

import { cn } from "@/utils/cn";

/**
 * One scrollable page inside a `SwipeTabs` pager. The pager gives each page a
 * fixed height, so the page scrolls internally. Horizontal padding lives here
 * (not on the Screen) so the pager itself stays full-bleed and pages slide
 * edge to edge.
 */
export function TabPage({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn("grow gap-3 px-5 pb-8 pt-1", contentClassName)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
