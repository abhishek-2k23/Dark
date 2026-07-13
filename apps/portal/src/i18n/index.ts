import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";

export const SUPPORTED_LANGUAGES = ["en", "hi"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "portl.language";

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;

/** Best-effort device language, falling back to English. */
export function getDeviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return SUPPORTED_LANGUAGES.includes(code as Language)
    ? (code as Language)
    : "en";
}

// Initialise synchronously with the device language; the LanguageProvider
// swaps in the persisted preference once AsyncStorage resolves.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    // React Native has no Suspense-friendly file loading; keep it eager.
    react: { useSuspense: false },
  });
}

export default i18n;
