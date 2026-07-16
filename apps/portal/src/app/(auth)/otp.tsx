import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";

import { OtpInput } from "@/components/OtpInput";
import { Button, Icon, Link, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { countdown } from "@/utils/format";
import { toErrorMessage } from "@/utils/errors";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * Minimum wait between OTP sends. Email delivery can take a minute, and a
 * user hammering resend just races their own codes — each new one invalidates
 * the last, so the code in their inbox stops working.
 */
const RESEND_WAIT_MS = 2 * 60 * 1000;

const OTP_LENGTH = 6;

/**
 * OTP entry, styled after UI/OTP.jpg: back chevron, "sent to" line over the
 * bold address, segmented digit boxes, resend countdown on the right, and
 * Continue pinned to the bottom above the keyboard.
 */
export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    devCode?: string;
    flow?: string;
  }>();
  const email = params.email ?? "";
  const fromSignup = params.flow === "signup";
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  // Prefilled from the dev echo when present; empty in real (emailed) flows.
  const [code, setCode] = useState(params.devCode ?? "");

  // A code was already sent by whatever pushed this screen, so the clock
  // starts at mount, not at the first resend.
  const [resendAt, setResendAt] = useState(() => new Date(Date.now() + RESEND_WAIT_MS));
  const [remaining, setRemaining] = useState<string | null>(() => countdown(resendAt));

  useEffect(() => {
    const tick = () => setRemaining(countdown(resendAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  /**
   * router.back() is a silent no-op when this screen has nothing behind it
   * (opened from a cold start or a deep link) — the "doesn't work" failure
   * mode. Fall back to replacing with the login screen.
   */
  const backToLogin = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/login");
  };

  const verify = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t(fromSignup ? "signup.welcome" : "auth.welcomeToast"), "success");
      // First login after signup → collect photo + emergency contact before
      // the dashboard. Society-less signups pass the no-society gate first;
      // that screen sends them to profile-setup once they're approved.
      if (fromSignup && session.user.societyId && session.user.role === "RESIDENT") {
        router.replace("/(resident)/profile-setup");
      }
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const resend = trpc.auth.resendEmailOtp.useMutation({
    onSuccess: (res) => {
      showToast(t("otp.resent"), "info");
      if (res.devCode) setCode(res.devCode);
      setResendAt(new Date(Date.now() + RESEND_WAIT_MS));
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onVerify = (value: string = code) => {
    const cleaned = value.trim();
    if (cleaned.length < OTP_LENGTH) {
      showToast(t("otp.missingCode"), "error");
      return;
    }
    if (verify.isPending) return;
    verify.mutate({ email, code: cleaned });
  };

  return (
    <Screen aurora="hero">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 gap-6 pb-6 pt-2">
          {/* The chevron is also the "wrong address" exit — a mistyped email
              is unrecoverable from here, the code went somewhere else. */}
          <Pressable
            onPress={backToLogin}
            accessibilityRole="button"
            accessibilityLabel={t("otp.back")}
            hitSlop={12}
            className="-ml-2 h-10 w-10 items-center justify-center active:opacity-70"
          >
            <Icon name="chevron-back" size={26} color="content" />
          </Pressable>

          <View className="gap-1">
            <Text variant="bodyLarge" color="secondary">
              {t("otp.sentTo")}
            </Text>
            <Text variant="h1">{email}</Text>
          </View>

          <OtpInput
            value={code}
            onChange={setCode}
            length={OTP_LENGTH}
            onFilled={onVerify}
          />

          <View className="flex-row items-center justify-between">
            <Text variant="bodySmall" color="tertiary">
              {t("otp.notReceived")}
            </Text>
            {remaining ? (
              <Text variant="bodySmall" color="tertiary">
                {t("otp.resendIn", { time: remaining })}
              </Text>
            ) : (
              <Link
                label={t("otp.resend")}
                size="sm"
                onPress={() => {
                  if (resend.isPending) return;
                  resend.mutate({ email });
                }}
              />
            )}
          </View>

          {/* Reference pins the action to the bottom, above the keyboard. */}
          <View className="flex-1" />
          <Button
            label={t("common.continue")}
            variant="primary"
            size="lg"
            loading={verify.isPending}
            onPress={() => onVerify()}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
