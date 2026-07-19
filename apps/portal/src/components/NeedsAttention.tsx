import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SectionHeader } from "@/components/SectionHeader";
import { GlassCard, Icon, Skeleton, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import type { Role } from "@/stores/authStore";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { notificationHref, notificationTypeIcon } from "@/utils/domain";
import { relativeTime } from "@/utils/format";

/**
 * The dashboard's needs-attention feed: everything that has happened to this
 * user and not yet been seen, newest first, each card a shortcut to the screen
 * that resolves it.
 *
 * Sourced from notifications rather than a bespoke activity query — every event
 * worth surfacing here (a ticket moving, a comment, an assignment, a notice, a
 * due) already writes one, addressed to exactly the right people, and already
 * carries the ids `notificationHref` needs to route. A second aggregation would
 * be a parallel truth that could disagree with the inbox.
 *
 * Unread-only by design: this is a to-do list, not a log. Opening a card marks
 * it read, so it leaves the dashboard and the section collapses to nothing once
 * the user is caught up. The full history stays in the notifications inbox.
 */

/** Kept short — this is a summary that hands off, not a list to scroll. */
const MAX_ITEMS = 4;

/**
 * Types whose accent should read as "something needs you" rather than neutral
 * news. Everything else takes the theme's primary.
 */
const URGENT_TYPES = new Set([
  "VISITOR_PENDING",
  "TICKET_RAISED",
  "PAYMENT_REJECTED",
  "SUBSCRIPTION_EXPIRED",
  "PAYOUT_TRANSFER_FAILED",
  "BOOKING_PAYMENT_EXPIRED",
  "SERVICE_PAYMENT_REVERSED",
]);

export function NeedsAttention({
  role,
  /** Where "View all" goes — the role's notifications inbox. */
  inboxHref,
}: {
  role: Role;
  inboxHref: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const utils = trpc.useUtils();

  const q = trpc.notification.list.useQuery(
    { limit: MAX_ITEMS, unreadOnly: true },
    // The dashboard is a glanceable surface people leave open; poll it on the
    // same cadence as the pending-visitor queue beside it.
    { refetchInterval: 30_000 },
  );

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => void utils.notification.list.invalidate(),
  });

  const items = q.data?.items ?? [];
  const unreadCount = q.data?.unreadCount ?? 0;

  // Nothing pending is the good case: stay out of the way entirely rather than
  // occupying a section to say "nothing here".
  if (!q.isLoading && items.length === 0) return null;

  return (
    <View className="gap-3">
      <SectionHeader
        title={
          unreadCount > 0
            ? t("dashboard.needsAttentionCount", { count: unreadCount })
            : t("dashboard.needsAttention")
        }
        onSeeAll={() => router.push(inboxHref as never)}
      />

      {q.isLoading ? (
        <View className="gap-2.5">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} radius={20} className="h-[74px] w-full" />
          ))}
        </View>
      ) : (
        <View className="gap-2.5">
          {items.map((n) => {
            const href = notificationHref(role, n.type, n.data);
            const urgent = URGENT_TYPES.has(n.type);
            const accent = urgent ? colors.warning : colors.primary;

            return (
              <GlassCard
                key={n.id}
                variant="hero"
                radius="3xl"
                padding="none"
                onPress={() => {
                  markRead.mutate({ notificationId: n.id });
                  if (href) router.push(href as never);
                }}
              >
                <View className="flex-row items-center gap-3 p-4">
                  <View
                    className="items-center justify-center rounded-2xl"
                    style={{
                      width: 42,
                      height: 42,
                      backgroundColor: withAlpha(accent, 0.14),
                      borderWidth: 1,
                      borderColor: withAlpha(accent, 0.3),
                    }}
                  >
                    <Icon
                      name={notificationTypeIcon[n.type] ?? "notifications-outline"}
                      size={19}
                      color={urgent ? "warning" : "primary"}
                    />
                  </View>

                  <View className="flex-1 gap-0.5">
                    <Text variant="subtitle" numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {n.body}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {relativeTime(n.createdAt)}
                    </Text>
                  </View>

                  {/* Only promise a destination when there is one — a chevron on
                      a card that goes nowhere is a broken affordance. */}
                  {href && <Icon name="chevron-forward" size={16} color="tertiary" />}
                </View>
              </GlassCard>
            );
          })}

          {unreadCount > items.length && (
            <Text variant="caption" color="tertiary" align="center">
              {t("dashboard.andMorePending", { count: unreadCount - items.length })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
