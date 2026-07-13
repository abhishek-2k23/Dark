import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import i18n, {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./index";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Toggle between the two supported languages. */
  toggleLanguage: () => void;
  supported: readonly Language[];
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Re-render the tree on language change via react-i18next.
  const { i18n: instance } = useTranslation();
  const [language, setLanguageState] = useState<Language>(
    (instance.language as Language) ?? "en",
  );

  // Apply the persisted preference once it loads.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((stored) => {
      if (
        active &&
        stored &&
        SUPPORTED_LANGUAGES.includes(stored as Language) &&
        stored !== instance.language
      ) {
        void i18n.changeLanguage(stored);
        setLanguageState(stored as Language);
      }
    });
    return () => {
      active = false;
    };
  }, [instance.language]);

  const setLanguage = useCallback((lang: Language) => {
    void i18n.changeLanguage(lang);
    setLanguageState(lang);
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === "en" ? "hi" : "en";
      void i18n.changeLanguage(next);
      void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      supported: SUPPORTED_LANGUAGES,
    }),
    [language, setLanguage, toggleLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a <LanguageProvider>");
  }
  return ctx;
}
