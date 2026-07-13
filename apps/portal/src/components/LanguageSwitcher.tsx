import { useTranslation } from "react-i18next";

import { type Language } from "@/i18n";
import { useLanguage } from "@/i18n/LanguageProvider";
import { SegmentedControl } from "./ui";

/** English / Hindi selector wired to the LanguageProvider. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const options: { value: Language; label: string }[] = [
    { value: "en", label: t("settings.english") },
    { value: "hi", label: t("settings.hindi") },
  ];

  return (
    <SegmentedControl
      options={options}
      value={language}
      onChange={setLanguage}
      className={className}
    />
  );
}
