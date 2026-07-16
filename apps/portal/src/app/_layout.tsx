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
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationsListener } from "@/components/NotificationsListener";
import { DialogHost } from "@/components/DialogHost";
import { ToastHost } from "@/components/ToastHost";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useOTAUpdates } from "@/lib/useOTAUpdates";
import { TRPCProvider } from "@/providers/TRPCProvider";
import { useAuthStore } from "@/stores/authStore";
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

  // Check for and apply OTA (EAS) updates on launch / foreground.
  useOTAUpdates();

  // Restore any persisted session as soon as the app starts.
  useEffect(() => {
    void useAuthStore.getState().hydrate();
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
              <DialogHost />
              {/* After DialogHost so toasts stay visible above an open dialog. */}
              <ToastHost />
            </LanguageProvider>
          </ThemeProvider>
        </TRPCProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
