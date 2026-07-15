import type { ExpoConfig, ConfigContext } from "expo/config";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://dark-9k8o.onrender.com";

/** Base URL of the web app that hosts the legal/support & account-deletion pages. */
const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://prangan.iamabhishek01.dev";

/** EAS project id — also drives the OTA update URL below. */
const EAS_PROJECT_ID = "7096d5b3-fd1d-415d-90a8-f3a03e4b46ce";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Prangan",
  slug: "prangan",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "prangan",
  userInterfaceStyle: "automatic",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    fallbackToCacheTimeout: 10_000,
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    package: "com.prangan.app",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#050508",
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
        backgroundColor: "#050508",
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
    apiUrl: API_URL,
    webUrl: WEB_URL,
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? null,
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
