import type { ExpoConfig, ConfigContext } from "expo/config";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://dark-9k8o.onrender.com";
const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://prangan.iamabhishek01.dev";
const EAS_PROJECT_ID = "7096d5b3-fd1d-415d-90a8-f3a03e4b46ce";

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
    bundleIdentifier: "com.prangan.app",
    supportsTablet: true,
    infoPlist: {
      /**
       * iOS refuses to report an app as installed unless its scheme is
       * declared here. Razorpay's checkout uses this to decide which UPI apps
       * to offer — without it the UPI option looks broken on iOS even when the
       * user has the app, and they are pushed to card instead.
       *
       * Only affects the subscription checkout; resident UPI payments use
       * their own intent link from UpiPaySheet.
       */
      LSApplicationQueriesSchemes: [
        "tez", // Google Pay
        "phonepe",
        "paytmmp", // Paytm
        "bhim",
        "credpay",
        "upi",
      ],
    },
  },
  android: {
    package: "com.prangan.app",
    googleServicesFile: "./google-services.json",
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
        // 76 was Expo's stock value for its own small mark. The Portl logo is
        // a 1024px square that reads as a house arch — at 76 it was a speck.
        imageWidth: 200,
        dark: {
          backgroundColor: "#050508",
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
        },
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
      "expo-camera",
      {
        cameraPermission:
          "Prangan uses your camera so guards can scan a guest's gate pass at the gate.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#2563EB",
      },
    ],
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
