import type { ExpoConfig, ConfigContext } from "expo/config";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://dark-9k8o.onrender.com";

/** Base URL of the web app that hosts the legal/support & account-deletion pages. */
const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://prangan.iamabhishek01.dev";

/** EAS project id — also drives the OTA update URL below. */
const EAS_PROJECT_ID = "7096d5b3-fd1d-415d-90a8-f3a03e4b46ce";

/**
 * Google sign-in credentials. Three separate values, easy to mix up:
 *
 * - WEB client id — the ID token audience. Must equal the API's
 *   `GOOGLE_CLIENT_ID` or the server rejects every token. Used on all platforms.
 * - IOS client id — identifies the iOS app to Google. iOS only.
 * - IOS url scheme — the iOS client id reversed
 *   (`com.googleusercontent.apps.<id>`), baked into Info.plist at build time so
 *   Google can call back into the app.
 *
 * Android needs no id here; it's matched by package name + signing SHA-1.
 *
 * Unset values are `undefined`, never `null`: Expo serializes a `null` in
 * `extra` as `{}`, which is truthy — so a "not configured" check against it
 * silently passes and the SDK receives `{}` as a client id. `undefined` keys are
 * dropped from the manifest, which is what the readers in `lib/env.ts` expect.
 */
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || undefined;
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const GOOGLE_IOS_URL_SCHEME =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || undefined;

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
    // Required for the iOS Google OAuth client (and for any iOS build at all).
    // Matches the Android package so both platforms register the same identity.
    bundleIdentifier: "com.prangan.app",
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
    [
      "expo-image-picker",
      {
        photosPermission:
          "Prangan uses your photos so you can set a profile picture and attach images to complaints.",
        cameraPermission:
          "Prangan uses your camera so you can photograph an issue when raising a complaint.",
      },
    ],
    [
      "expo-notifications",
      {
        // Android renders this as a silhouette, so it must be white-on-transparent
        // — the monochrome variant is the only icon here that qualifies.
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#2563EB",
      },
    ],
    // Registers the iOS callback URL scheme — nothing else. It throws when
    // `iosUrlScheme` is missing, so it only joins the build once the iOS client
    // exists; Android sign-in works fine without it.
    ...(GOOGLE_IOS_URL_SCHEME
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: GOOGLE_IOS_URL_SCHEME },
          ] as [string, { iosUrlScheme: string }],
        ]
      : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    apiUrl: API_URL,
    webUrl: WEB_URL,
    googleClientId: GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: GOOGLE_IOS_CLIENT_ID,
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
