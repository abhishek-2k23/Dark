import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nwColorScheme } from "nativewind";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { palettes, type ColorScheme, type ThemeColors } from "./colors";

/** User-facing preference. "system" = follow the OS (auto). */
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "portl.theme.mode";

interface ThemeContextValue {
  /** The stored preference. */
  mode: ThemeMode;
  /** The concrete scheme in effect right now (system resolved to light/dark). */
  scheme: ColorScheme;
  /** Raw color values for the active scheme (icons, gradients, status bar…). */
  colors: ThemeColors;
  /** Whether the initial persisted preference has loaded. */
  isReady: boolean;
  setMode: (mode: ThemeMode) => void;
  /** Cycle system → light → dark → system. */
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const MODES: ThemeMode[] = ["system", "light", "dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = (useColorScheme() ?? "light") as ColorScheme;
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [isReady, setIsReady] = useState(false);

  // Hydrate the persisted preference on launch.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && stored && MODES.includes(stored as ThemeMode)) {
          setModeState(stored as ThemeMode);
        }
      })
      .finally(() => active && setIsReady(true));
    return () => {
      active = false;
    };
  }, []);

  // Keep NativeWind's runtime in sync so `dark:` variants and the CSS custom
  // properties in global.css flip with the preference.
  useEffect(() => {
    nwColorScheme.set(mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next = MODES[(MODES.indexOf(prev) + 1) % MODES.length];
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const scheme: ColorScheme = mode === "system" ? systemScheme : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors: palettes[scheme],
      isReady,
      setMode,
      cycleMode,
    }),
    [mode, scheme, isReady, setMode, cycleMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
