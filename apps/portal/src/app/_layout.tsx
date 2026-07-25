import "../../global.css";

import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "@/components/AnimatedSplash";
import { BiometricGate } from "@/components/BiometricGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationsListener } from "@/components/NotificationsListener";
import { EmergencyHost } from "@/components/EmergencyHost";
import { DialogHost } from "@/components/DialogHost";
import { ToastHost } from "@/components/ToastHost";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useOTAUpdates } from "@/lib/useOTAUpdates";
import { TRPCProvider } from "@/providers/TRPCProvider";
import { useAuthStore } from "@/stores/authStore";
import { useBiometricStore } from "@/stores/biometricStore";
import { ThemeProvider, useTheme } from "@/theme";
// Side-effect: initialise i18next before any component calls useTranslation.
import "@/i18n";

SplashScreen.preventAutoHideAsync();

/** Status bar contrast follows the active theme (including manual override). */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

/**
 * Themed navigator: paints the native window and every stack scene with the
 * theme background so route transitions never flash white.
 */
function ThemedStack() {
  const { colors } = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

/**
 * Bridges the native launch screen and the app.
 *
 * Mounts inside ThemeProvider (it reads theme colours) and unmounts itself for
 * good once the hand-off finishes — a splash that can reappear mid-session
 * would be a bug, not a flourish.
 */
function SplashGate() {
  const authStatus = useAuthStore((s) => s.status);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <AnimatedSplash
      loading={authStatus === "loading"}
      onDone={() => setDone(true)}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  // Downloads OTA (EAS) updates in the background and offers a restart once one
  // is ready; never reloads on its own.
  useOTAUpdates();

  // Restore any persisted session as soon as the app starts.
  useEffect(() => {
    void useAuthStore.getState().hydrate();
    // Probe the sensor and load the app-lock preference; this decides whether
    // the very first paint is veiled by the BiometricGate.
    void useBiometricStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Keep the native splash up until fonts resolve to avoid a fallback-font flash.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TRPCProvider>
          <ThemeProvider>
            <LanguageProvider>
              <ThemedStatusBar />
              <ErrorBoundary>
                <ThemedStack />
              </ErrorBoundary>
              <NotificationsListener />
              {/* Before DialogHost: the banner's stand-down prompt is a dialog,
                  which must paint above the banner that opened it. */}
              <EmergencyHost />
              <DialogHost />
              {/* After DialogHost so toasts stay visible above an open dialog. */}
              <ToastHost />
              {/* Biometric app-lock: veils the app until the owner re-auths. */}
              <BiometricGate />
              {/* Last child: it veils everything until hydration settles. */}
              <SplashGate />
            </LanguageProvider>
          </ThemeProvider>
        </TRPCProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
