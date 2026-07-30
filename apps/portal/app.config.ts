import type { ExpoConfig, ConfigContext } from "expo/config";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://dark-9k8o.onrender.com";
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://prangan.iamabhishek01.dev";
// const EAS_PROJECT_ID = "7096d5b3-fd1d-415d-90a8-f3a03e4b46ce";
const EAS_PROJECT_ID = "7fa13a5c-f901-41a1-a4ba-14969e87f98f";

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || undefined;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const GOOGLE_IOS_URL_SCHEME = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || undefined;

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
    /**
     * 0 = never hold the launch waiting on the update server.
     *
     * This was 10_000, which made every cold start sit on the splash for up to
     * ten seconds — on a weak connection that is the whole launch, and the
     * payoff was only ever "start on the new bundle instead of the next one".
     * At 0 the app always boots the cached bundle immediately and the download
     * continues in the background; `useOTAUpdates` then offers a restart once
     * it lands, and expo-updates applies it on the next launch regardless.
     */
    fallbackToCacheTimeout: 0,
    // Native check on every cold start. The foreground-return check lives in
    // `useOTAUpdates`, which the native module does not cover.
    checkAutomatically: "ON_LOAD",
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
      /**
       * iOS has no shared Downloads folder, so these two keys are what make a
       * "download" mean anything here: together they surface the app's own
       * Documents directory in the Files app as "On My iPhone → Prangan".
       * `lib/download.ts` writes there, which is why the file is findable
       * afterwards instead of being sealed inside the sandbox.
       *
       * Both are build-time Info.plist entries — they cannot ship over OTA.
       */
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
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
    /**
     * Permissions a clean prebuild would otherwise ship that the app has no
     * feature for. Both show up on the Play listing and in the runtime
     * permission review, and an unjustifiable permission is a rejection under
     * Play's Permissions policy ("request only what is needed for currently
     * implemented functionality").
     *
     * - RECORD_AUDIO: added unconditionally by expo-image-picker's plugin.
     *   expo-camera already opts out via `recordAudioAndroid: false`, but that
     *   only declines to add it — it does not remove image-picker's copy. We
     *   never record audio: the camera is stills only (complaint photos, gate
     *   pass scanning).
     * - SYSTEM_ALERT_WINDOW: comes from the bare-workflow manifest template for
     *   the dev menu overlay. Nothing in the app draws over other apps.
     */
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    /**
     * Firebase App Check — Play Integrity on Android, App Attest on iOS. The
     * native side is what mints the attestation token that `src/lib/appCheck.ts`
     * attaches to every API call. Reuses the same google-services.json the
     * notification icon config already relies on.
     *
     * An iOS release additionally needs `ios.googleServicesFile`
     * (GoogleService-Info.plist) — without it FirebaseApp cannot configure and
     * the app will not launch. Android-only for now, which is what is being
     * submitted.
     */
    "@react-native-firebase/app",
    "@react-native-firebase/app-check",
    [
      "expo-build-properties",
      {
        // React Native Firebase requires static frameworks on iOS.
        ios: { useFrameworks: "static" },
        android: {
          // R8/ProGuard: shrink + obfuscate the release build. Only affects
          // `assembleRelease` — debug/dev-client builds are never minified, so
          // this is invisible in the dev build and must be smoke-tested on a
          // real release/preview build before shipping.
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Reflection-heavy libraries can be stripped by R8 without keep
          // rules; add them here as crashes surface in release testing.
          extraProguardRules: ["-keep class com.prangan.app.** { *; }"].join("\n"),
        },
      },
    ],
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
        // Stills only — declining this is what stops the plugin adding
        // RECORD_AUDIO (see `android.blockedPermissions`) and the matching iOS
        // microphone purpose string for a feature the app does not have.
        microphonePermission: false,
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
      "expo-local-authentication",
      {
        faceIDPermission: "Prangan uses Face ID to lock the app so only you can open it.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#2563EB",
      },
    ],
    // Native share sheet: exporting the visitor log as a PDF and handing the
    // admin a blank import template. Config plugin adds the iOS entitlement.
    "expo-sharing",
    [
      "expo-document-picker",
      {
        // The bulk resident import reads a spreadsheet the admin picked. Only
        // needed on iOS, where reaching iCloud Drive is a separate capability.
        iCloudContainerEnvironment: "Production",
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
