import { useTranslation } from "react-i18next";

import { useTheme, type ThemeMode } from "@/theme";
import { SegmentedControl } from "./ui";

/** Auto / Light / Dark selector wired to the ThemeProvider. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  const options: { value: ThemeMode; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
  ];

  return (
    <SegmentedControl
      options={options}
      value={mode}
      onChange={setMode}
      className={className}
    />
  );
}
