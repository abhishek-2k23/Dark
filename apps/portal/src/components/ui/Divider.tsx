import { View } from "react-native";

import { cn } from "@/utils/cn";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/** A hairline separator. Uses the theme border color. */
export function Divider({
  orientation = "horizontal",
  className,
}: DividerProps) {
  return (
    <View
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}
