import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { sendTestNotification } from "@/lib/push";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  GlassCard,
  Icon,
  IconCircle,
  Input,
  Link,
  NeonTile,
  Screen,
  SegmentedControl,
  Text,
} from "@/components/ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" color="secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function Showcase() {
  const { t } = useTranslation();
  const [range, setRange] = useState<"today" | "week" | "month">("today");
  const [phone, setPhone] = useState("");

  return (
    <Screen scroll contentClassName="gap-7 py-4">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Avatar name="John Doe" size={44} />
          <View className="shrink">
            <Text variant="caption" color="secondary">
              {t("app.brandline")}
            </Text>
            <Text variant="h3" color="primary">
              {t("app.name")}
            </Text>
          </View>
        </View>
        <IconCircle name="notifications-outline" tone="neutral" size={40} />
      </View>

      <View className="gap-1">
        <Text variant="display">{t("showcase.title")}</Text>
        <Text variant="bodyLarge" color="secondary">
          {t("showcase.subtitle")}
        </Text>
      </View>

      {/* Appearance + language */}
      <View className="gap-4">
        <Section title={t("settings.appearance")}>
          <ThemeSwitcher />
        </Section>
        <Section title={t("settings.language")}>
          <LanguageSwitcher />
        </Section>
      </View>

      {/* Dev-only: local notification tester — no FCM / push build needed. */}
      <Section title="Dev · Test Notifications">
        <Text variant="caption" color="secondary">
          Fires a local notification to exercise the handler + tap deep-link (no
          push credentials needed). Background the app after tapping to see the
          banner. Log in as the matching role first to see tap-routing; the demo
          ids route to the screen but won&apos;t load real data.
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <Button
            label="Visitor approved"
            variant="outline"
            size="sm"
            leftIcon="checkmark-circle-outline"
            onPress={() =>
              void sendTestNotification({
                title: "Visitor approved",
                body: "Your guest has been approved at the gate.",
                data: { type: "VISITOR_APPROVED", visitorId: "demo-visitor-id" },
              })
            }
          />
          <Button
            label="New notice"
            variant="outline"
            size="sm"
            leftIcon="megaphone-outline"
            onPress={() =>
              void sendTestNotification({
                title: "New notice published",
                body: "Water maintenance on the 15th, 9 AM – 5 PM.",
                data: { type: "NOTICE_PUBLISHED", noticeId: "demo-notice-id" },
              })
            }
          />
          <Button
            label="Generic"
            variant="outline"
            size="sm"
            leftIcon="notifications-outline"
            onPress={() =>
              void sendTestNotification({
                title: "Prangan",
                body: "This is a test notification.",
                data: { type: "GENERAL" },
              })
            }
          />
        </View>
      </Section>

      {/* Glass surfaces */}
      <Section title="Glass Cards">
        <GlassCard variant="hero" padding="lg" className="gap-1.5">
          <Text variant="overline" color="secondary">
            Hero · bright hairline
          </Text>
          <Text variant="h2">Find Your Dream Home</Text>
          <Text variant="body" color="secondary">
            Explore our listings for the perfect place to call your own.
          </Text>
        </GlassCard>
        <View className="flex-row gap-3">
          <GlassCard className="flex-1 gap-1">
            <Text variant="title">Glass</Text>
            <Text variant="caption" color="secondary">
              Translucent + hairline
            </Text>
          </GlassCard>
          <GlassCard variant="glassStrong" className="flex-1 gap-1">
            <Text variant="title">Strong</Text>
            <Text variant="caption" color="secondary">
              Heavier fill
            </Text>
          </GlassCard>
        </View>
        <View className="flex-row gap-3">
          <GlassCard variant="neon" className="flex-1 gap-1">
            <Text variant="title">Neon</Text>
            <Text variant="caption" color="secondary">
              Bright hairline
            </Text>
          </GlassCard>
          <GlassCard variant="hero" className="flex-1 gap-1">
            <Text variant="title">Hero</Text>
            <Text variant="caption" color="secondary">
              Bright hairline + heavy fill
            </Text>
          </GlassCard>
        </View>
      </Section>

      {/* Neon tiles — quick-action grid */}
      <Section title="Neon Tiles">
        <View className="flex-row flex-wrap justify-between gap-y-4">
          <NeonTile name="qr-code-outline" hue="blue" label="Digital ID" />
          <NeonTile name="lock-closed-outline" hue="violet" label="Pre-Approve" />
          <NeonTile name="document-text-outline" hue="blue" label="Notice Board" />
          <NeonTile name="calendar-outline" hue="violet" label="Events" />
          <NeonTile name="construct-outline" hue="violet" label="Handyman" />
          <NeonTile name="key-outline" hue="blue" label="Rentals" />
          <NeonTile name="sparkles-outline" hue="violet" label="Salon & Spa" />
          <NeonTile name="cart-outline" hue="blue" label="Market" />
        </View>
      </Section>

      {/* Typography */}
      <Section title={t("showcase.typography")}>
        <Card variant="outlined" className="gap-2">
          <Text variant="h1">{t("auth.welcomeBack")}</Text>
          <Text variant="h2" color="primary">
            {t("dashboard.activePoll")}
          </Text>
          <Text variant="title">{t("showcase.sampleCardTitle")}</Text>
          <Text variant="body" color="secondary">
            {t("auth.mobilePrompt")}
          </Text>
          <Text variant="caption" color="tertiary">
            © 2026 Prangan Management · v2.4.0
          </Text>
        </Card>
      </Section>

      {/* Sample visitor-approval card (warning) */}
      <Section title={t("showcase.cards")}>
        <Card className="gap-4 border border-warning/30 bg-warning-soft">
          <View className="flex-row items-start gap-3">
            <IconCircle name="location-outline" tone="warning" />
            <View className="shrink gap-0.5">
              <Text variant="title">{t("showcase.sampleCardTitle")}</Text>
              <Text variant="body" color="secondary">
                {t("showcase.sampleCardBody")}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <Button
              label={t("common.approve")}
              variant="success"
              leftIcon="checkmark-circle-outline"
              className="flex-1"
            />
            <Button
              label={t("common.deny")}
              variant="danger"
              leftIcon="close-circle-outline"
              className="flex-1"
            />
          </View>
        </Card>

        <View className="flex-row gap-3">
          <Card variant="elevated" className="flex-1 items-center gap-2 py-5">
            <IconCircle name="person-add-outline" tone="primary" />
            <Text variant="subtitle" color="primary" align="center">
              {t("dashboard.preApproveGuest")}
            </Text>
          </Card>
          <Card variant="elevated" className="flex-1 items-center gap-2 py-5">
            <IconCircle name="warning-outline" tone="accent" />
            <Text variant="subtitle" color="primary" align="center">
              {t("dashboard.raiseTicket")}
            </Text>
          </Card>
        </View>

        {/* Solid colored notice card */}
        <Card className="gap-1 bg-primary-strong">
          <View className="flex-row items-center gap-1.5">
            <Icon name="water-outline" size={15} color="onPrimary" />
            <Text variant="overline" color="onPrimary">
              Maintenance
            </Text>
          </View>
          <Text variant="h3" color="onPrimary">
            Water maintenance on 15th Oct
          </Text>
          <Text variant="bodySmall" color="onPrimary" className="opacity-80">
            9:00 AM – 5:00 PM
          </Text>
        </Card>
      </Section>

      {/* Buttons */}
      <Section title={t("showcase.buttons")}>
        <View className="flex-row flex-wrap gap-3">
          <Button label={t("common.approve")} variant="primary" />
          <Button label={t("common.save")} variant="success" />
          <Button label={t("common.cancel")} variant="secondary" />
          <Button label={t("common.retry")} variant="outline" />
          <Button label={t("common.deny")} variant="dangerSoft" />
          <Button label={t("showcase.learnMore")} variant="ghost" size="sm" />
        </View>
        <Button
          label={t("common.enterDashboard")}
          variant="primary"
          size="lg"
          leftIcon="checkmark-circle-outline"
          fullWidth
        />
        <View className="flex-row gap-3">
          <Button label={t("common.loading")} loading className="flex-1" />
          <Button
            label={t("auth.sendOtp")}
            rightIcon="arrow-forward"
            className="flex-1"
          />
        </View>
      </Section>

      {/* Inputs */}
      <Section title={t("showcase.inputs")}>
        <Input
          label={t("auth.mobileNumber")}
          required
          leftIcon="call-outline"
          placeholder={t("auth.phonePlaceholder")}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Input
          label="Vehicle Number"
          leftIcon="car-outline"
          placeholder="ABC-1234"
          autoCapitalize="characters"
        />
        <Input
          label={t("auth.mobileNumber")}
          leftIcon="call-outline"
          placeholder={t("auth.phonePlaceholder")}
          error="Please enter a valid 10-digit number."
        />
      </Section>

      {/* Badges */}
      <Section title={t("showcase.badges")}>
        <View className="flex-row flex-wrap gap-2">
          <Badge label={t("common.live")} tone="mint" dot uppercase />
          <Badge label={t("common.primary")} tone="mint" />
          <Badge label={t("status.approved")} tone="success" uppercase />
          <Badge label={t("status.pending")} tone="warning" uppercase />
          <Badge label={t("status.denied")} tone="danger" uppercase />
          <Badge label={t("status.active")} tone="success" dot />
          <Badge label={t("status.scheduled")} tone="neutral" dot />
        </View>
      </Section>

      {/* Segmented control */}
      <Section title="Segmented Control">
        <SegmentedControl
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
      </Section>

      {/* Icons + avatars */}
      <Section title={t("showcase.icons")}>
        <View className="flex-row flex-wrap items-center gap-3">
          <IconCircle name="home-outline" tone="primary" />
          <IconCircle name="shield-checkmark-outline" tone="success" />
          <IconCircle name="calendar-outline" tone="peach" />
          <IconCircle name="wallet-outline" tone="primary" />
          <IconCircle name="alert-circle-outline" tone="danger" />
        </View>
        <View className="flex-row items-center gap-3">
          <Avatar name="Aditi Rao" size={40} />
          <Avatar name="John Doe" size={40} />
          <Avatar
            uri="https://i.pravatar.cc/100?img=12"
            name="Guest"
            size={40}
          />
        </View>
      </Section>

      {/* Links */}
      <Section title={t("showcase.links")}>
        <View className="flex-row flex-wrap items-center gap-4">
          <Link label={t("common.viewAll")} rightIcon="chevron-forward" />
          <Link label={t("auth.terms")} underline />
          <Link label={t("common.voteNow")} color="success" />
        </View>
      </Section>

      <Divider className="my-2" />
      <Text variant="caption" color="tertiary" align="center" className="pb-4">
        {t("app.tagline")}
      </Text>
    </Screen>
  );
}
