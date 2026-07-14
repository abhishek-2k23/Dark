import type { ExpoConfig, ConfigContext } from "expo/config";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://dark-9k8o.onrender.com";

/** EAS project id — also drives the OTA update URL below. */
const EAS_PROJECT_ID = "18ca1c18-584c-4ec8-aad7-fd81448c227a";

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
      backgroundColor: "#E6F4FE",
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
    apiUrl: API_URL,
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? null,
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
