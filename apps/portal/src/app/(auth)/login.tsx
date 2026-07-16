import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AuroraBackground,
  type BlobSpec,
  Button,
  Divider,
  Icon,
  Input,
  Link,
  PasswordInput,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useGoogleSignIn } from "@/lib/useGoogleSignIn";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { toErrorMessage } from "@/utils/errors";

/**
 * One transition for every reflow on this screen, so the motion reads as one
 * gesture. Timing (not a spring): the field glides to the top and stops dead —
 * a spring overshoots, and the settle reads as a bounce.
 */
const transition = LinearTransition.duration(320).easing(Easing.inOut(Easing.cubic));

/**
 * The lone glow for the bottom strip: anchored low (offsetY) with a short
 * vertical roam, sized so its gaussian falloff hits zero above its top —
 * clipped only by the screen's own bottom/side edges, never mid-glow, so the
 * strip boundary never shows up as a hard line.
 */
const GLOW_SPECS: BlobSpec[] = [
  {
    size: 1.0,
    travelX: 0.5,
    travelY: 0.12,
    offsetY: 0.2,
    xMs: 11_000,
    yMs: 7_500,
    breatheMs: 6_500,
    breatheScale: 0.16,
  },
];

/**
 * Two-step login, styled after the BelleVie references in UI/.
 *
 * Step 1: full-bleed hero (branding baked into the image), the email field,
 * Google, and two links pinned to the bottom over a fade-to-background scrim.
 *
 * Focusing the email field IS the step change: the hero fades to black, the
 * field slides to the top under a bold title, the password appears, and Log in
 * pins to the bottom above the keyboard — one continuous motion, not a screen
 * swap.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  const [step, setStep] = useState<"landing" | "credentials">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<TextInput>(null);

  const heroOpacity = useSharedValue(1);
  const heroStyle = useAnimatedStyle(() => ({ opacity: heroOpacity.value }));

  const enterCredentials = () => {
    if (step === "credentials") return;
    setStep("credentials");
    heroOpacity.value = withTiming(0, { duration: 300 });
  };

  const backToLanding = () => {
    setStep("landing");
    heroOpacity.value = withTiming(1, { duration: 300 });
    Keyboard.dismiss();
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: async (res) => {
      if (res.status === "SUCCESS") {
        await setSession(res.session);
        showToast(t("auth.welcomeToast"), "success");
      } else {
        // Unverified email → confirm the OTP on the next screen.
        router.push({
          pathname: "/(auth)/otp",
          params: { email: res.email, devCode: res.devCode ?? "" },
        });
      }
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const googleLogin = trpc.auth.googleLogin.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t("auth.welcomeToast"), "success");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const google = useGoogleSignIn(
    (idToken) => googleLogin.mutate({ idToken }),
    (key) => showToast(t(key), "error"),
  );

  const onSubmit = () => {
    const cleaned = email.trim();
    if (!cleaned.includes("@")) {
      showToast(t("auth.missingEmail"), "error");
      return;
    }
    if (!password) {
      showToast(t("auth.missingFields"), "error");
      return;
    }
    login.mutate({ identifier: cleaned, password });
  };

  const onGoogle = () => {
    if (!google.available) {
      showToast(t("auth.googleUnavailable"), "info");
      return;
    }
    void google.promptAsync();
  };

  const credentials = step === "credentials";

  // The lone drifting glow lives in the bottom strip on both steps — under the
  // form on the landing step, and the only ambient color once the hero fades.
  const glowHeight = windowHeight * 0.38;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Fades out entirely on the credentials step — the reference is a
          plain dark form screen, and the photo would fight the keyboard. */}
      <Animated.View style={[StyleSheet.absoluteFill, heroStyle]} pointerEvents="none">
        <Image
          source={require("../../../assets/images/login-hero.png")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={[
            "transparent",
            withAlpha(colors.background, 0.55),
            withAlpha(colors.background, 0.92),
            colors.background,
          ]}
          locations={[0.34, 0.55, 0.78, 0.96]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* One drifting aurora blob, clipped to the bottom strip — the same
          ambient motion as the rest of the app, scoped to where the form sits.
          Mounted through both steps so the credentials screen keeps it. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: glowHeight,
          overflow: "hidden",
        }}
        pointerEvents="none"
      >
        <AuroraBackground
          specs={GLOW_SPECS}
          width={windowWidth}
          height={glowHeight}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
            justifyContent: credentials ? "flex-start" : "flex-end",
          }}
        >
          {credentials && (
            <Animated.View
              entering={FadeInDown.duration(220)}
              exiting={FadeOutDown.duration(160)}
              layout={transition}
              className="gap-5 pb-5"
            >
              <Pressable
                onPress={backToLanding}
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
                hitSlop={12}
                className="h-10 w-10 items-center justify-center active:opacity-70"
              >
                <Icon name="chevron-back" size={26} color="content" />
              </Pressable>
              <Text variant="h1">{t("auth.enterEmail")}</Text>
            </Animated.View>
          )}

          {!credentials && (
            <Animated.View
              key="welcome"
              entering={FadeInDown.duration(220)}
              exiting={FadeOutDown.duration(160)}
              layout={transition}
              className="gap-1.5 pb-6"
            >
              <Text variant="h1" align="center">
                {t("auth.welcomeTitle")}
              </Text>
              <Text variant="bodyLarge" color="secondary" align="center">
                {t("auth.welcomeTagline")}
              </Text>
            </Animated.View>
          )}

          {/* Always mounted — LinearTransition slides this same field between
              bottom (landing) and top (credentials). Focusing it advances. */}
          <Animated.View layout={transition}>
            <Input
              leftIcon="mail-outline"
              placeholder={t("auth.emailPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              blurOnSubmit={false}
              value={email}
              onChangeText={setEmail}
              onFocus={enterCredentials}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </Animated.View>

          {credentials ? (
            <Animated.View
              key="credentials"
              entering={FadeInDown.duration(220)}
              exiting={FadeOutDown.duration(160)}
              layout={transition}
              className="flex-1 gap-4 pt-4"
            >
              <PasswordInput
                ref={passwordRef}
                leftIcon="lock-closed-outline"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={onSubmit}
                returnKeyType="go"
              />
              <View className="flex-row flex-wrap items-center gap-x-1">
                <Text variant="caption" color="tertiary">
                  {t("auth.agreePrefix")}
                </Text>
                <Link label={t("auth.terms")} size="sm" />
                <Text variant="caption" color="tertiary">
                  {t("auth.and")}
                </Text>
                <Link label={t("auth.privacy")} size="sm" />
              </View>
              <Link
                label={t("auth.forgotPassword")}
                size="sm"
                onPress={() => router.push("/(auth)/forgot-password")}
              />

              {/* Reference pins the action to the bottom, above the keyboard. */}
              <View className="flex-1" />
              <Button
                label={t("auth.logIn")}
                variant="primary"
                size="lg"
                rightIcon="arrow-forward"
                loading={login.isPending}
                onPress={onSubmit}
                fullWidth
              />
            </Animated.View>
          ) : (
            <Animated.View
              key="landing"
              entering={FadeInDown.duration(220)}
              exiting={FadeOutDown.duration(160)}
              layout={transition}
              className="gap-4 pt-4"
            >
              <View className="flex-row items-center gap-3">
                <Divider className="flex-1" />
                <Text variant="overline" color="tertiary">
                  {t("auth.or")}
                </Text>
                <Divider className="flex-1" />
              </View>

              <Button
                label={t("auth.signInWithGoogle")}
                variant="primary"
                size="lg"
                leftIcon="logo-google"
                loading={googleLogin.isPending}
                onPress={onGoogle}
                fullWidth
              />

              <View className="flex-row items-center justify-center gap-2 pt-1">
                <Link
                  label={t("auth.createAccount")}
                  size="sm"
                  onPress={() => router.push("/(auth)/signup")}
                />
                <Text variant="caption" color="tertiary">
                  ·
                </Text>
                <Link
                  label={t("auth.createSociety")}
                  size="sm"
                  onPress={() => router.push("/(auth)/register-society")}
                />
              </View>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
