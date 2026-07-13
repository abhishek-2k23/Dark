import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Base URL of the Portl API (the Express server hosting REST + tRPC).
 *
 * Defaults to local dev. Real staging/prod URLs are wired later — override for
 * now via the `EXPO_PUBLIC_API_URL` env var (e.g. your machine's LAN IP when
 * testing on a physical device). Consumed through `expo-constants` in
 * `src/lib/env.ts`; Android-emulator localhost rewriting happens there too.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Portl Society",
  slug: "portal",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "portal",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-localization",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    // Runtime config surfaced via expo-constants (see src/lib/env.ts).
    apiUrl: API_URL,
    // Google OAuth web client id for "Continue with Google" — unset for now;
    // the button degrades gracefully until it (and server GOOGLE_CLIENT_ID) are set.
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? null,
    // eas: { projectId: "<set-later>" },
  },
});
