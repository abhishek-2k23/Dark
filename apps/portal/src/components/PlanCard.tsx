import { View } from "react-native";

import { Badge, Button, GlassCard, Icon, Text } from "@/components/ui";
import { typography } from "@/theme";
import { formatMoney } from "@/utils/format";

/**
 * A subscription plan card, sized for a peeking horizontal carousel.
 *
 * Built on the same neutral glass as every other surface in the app: cards
 * here are intentionally colorless, taking their color from the animated
 * aurora showing through the fill rather than from a border or a decorative
 * motif. The featured plan earns its emphasis from a brighter hairline, a
 * badge and a solid CTA — not from a hue, which would be the one card in the
 * app fighting the backdrop.
 */

export interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    intervalMonths: number;
    features: string[];
    isCurrent: boolean;
  };
  width: number;
  /**
   * Feature rows to reserve, so every card in the carousel is the same height
   * and their CTAs land on one baseline. Pass the max `featureSlots(plan)`
   * across the whole set; short plans pad with blank rows.
   */
  featureSlots: number;
  /** Emphasised treatment — brighter edge and a ribbon. */
  featured?: boolean;
  ctaLabel: string;
  intervalLabel: string;
  currentLabel: string;
  featuredLabel: string;
  loading?: boolean;
  onPress: () => void;
}

/** Features beyond this are summarised, so cards stay a predictable height. */
const MAX_FEATURES = 5;

/** Two lines of description are always reserved, even when there is none. */
const DESCRIPTION_HEIGHT = typography.caption.lineHeight * 2;

/**
 * How many feature rows a plan occupies, counting the "+n more" summary as a
 * row. Callers take the max across the set and pass it to every card as
 * `featureSlots` — that, plus the fixed description block, is what makes the
 * cards equal height.
 *
 * Height is equalised by reserving real rows rather than by a `flex-1` spacer
 * pushing the CTA down: the card clips its overflow, so anything that lets
 * content exceed the card's height silently eats the button.
 */
export function featureSlots(plan: { features: string[] }): number {
  const shown = Math.min(plan.features.length, MAX_FEATURES);
  return shown + (plan.features.length > MAX_FEATURES ? 1 : 0);
}

export function PlanCard({
  plan,
  width,
  featureSlots: slots,
  featured,
  ctaLabel,
  intervalLabel,
  currentLabel,
  featuredLabel,
  loading,
  onPress,
}: PlanCardProps) {
  const shown = plan.features.slice(0, MAX_FEATURES);
  const extra = plan.features.length - shown.length;

  return (
    <GlassCard
      variant={featured ? "hero" : "glass"}
      padding="lg"
      radius="3xl"
      style={{ width }}
      className="gap-4"
    >
      {/* Header --------------------------------------------------------- */}
      <View className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <Text variant="overline" color="secondary">
            {plan.name}
          </Text>
          {plan.isCurrent && <Badge label={currentLabel} tone="success" size="sm" />}
          {featured && !plan.isCurrent && (
            <Badge label={featuredLabel} tone="primary" size="sm" />
          )}
        </View>

        {/* Price is the one thing that should win the eye, so it is the
            only element at display scale. */}
        <View className="flex-row items-baseline gap-1.5">
          <Text variant="h1">{formatMoney(plan.price)}</Text>
          <Text variant="caption" color="tertiary">
            /{intervalLabel}
          </Text>
        </View>

        {/* Reserved whether or not there is a description, and clamped to two
            lines: a one-line pitch next to a two-line one would otherwise
            offset everything below it by a line. */}
        <View style={{ height: DESCRIPTION_HEIGHT }}>
          {plan.description && (
            <Text variant="caption" color="secondary" numberOfLines={2}>
              {plan.description}
            </Text>
          )}
        </View>
      </View>

      {/* Features ------------------------------------------------------- */}
      <View className="gap-2">
        {shown.map((f) => (
          <View key={f} className="flex-row items-start gap-2">
            <Icon name="checkmark-circle" size={15} color="success" />
            <Text variant="caption" color="secondary" className="flex-1" numberOfLines={1}>
              {f}
            </Text>
          </View>
        ))}
        {extra > 0 && (
          <Text variant="caption" color="tertiary">
            +{extra} more
          </Text>
        )}
        {/* Blank rows padding this plan out to the tallest card's row count.
            Built from the same JSX as a real row so the height matches
            exactly rather than relying on a hardcoded row height. */}
        {Array.from({ length: Math.max(0, slots - shown.length - (extra > 0 ? 1 : 0)) }, (_, i) => (
          <View
            key={`pad-${i}`}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="flex-row items-start gap-2"
            style={{ opacity: 0 }}
          >
            <Icon name="checkmark-circle" size={15} color="success" />
            <Text variant="caption" color="secondary" className="flex-1" numberOfLines={1}>
              {" "}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label={ctaLabel}
        variant={featured ? "primary" : "outline"}
        size="sm"
        loading={loading}
        onPress={onPress}
      />
    </GlassCard>
  );
}
