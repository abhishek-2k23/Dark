import { useTranslation } from "react-i18next";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Text } from "@/components/ui";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";

export interface TicketStubProps {
  /** The ticket's human-readable handle, e.g. "TKT-4B7Q2M". */
  referenceCode: string;
  /** Hide the QR where only the code matters (a list row). */
  showQr?: boolean;
}

const NOTCH = 18;

/**
 * The tear-off stub of a complaint ticket: the reference code, big and
 * monospaced, with a QR of the same code. It reads like a docket you'd be
 * handed at a service desk, which is exactly what it stands in for — the code
 * is what a resident quotes on the phone, and what maintenance staff scan to
 * pull the job up on the spot.
 */
export function TicketStub({ referenceCode, showQr = true }: TicketStubProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Painted in the page colour to read as a bite out of the ticket's edge.
  const notch = {
    position: "absolute" as const,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: colors.background,
  };

  return (
    <View
      className="w-full flex-row items-center gap-4 overflow-hidden p-4"
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: withAlpha(colors.primary, 0.45),
        backgroundColor: withAlpha(colors.primary, 0.06),
      }}
    >
      <View style={{ ...notch, left: -NOTCH / 2, top: "50%", marginTop: -NOTCH / 2 }} />
      <View style={{ ...notch, right: -NOTCH / 2, top: "50%", marginTop: -NOTCH / 2 }} />

      <View className="flex-1 gap-1">
        <Text variant="caption" color="tertiary">
          {t("tickets.reference")}
        </Text>
        {/* Selectable so it can be copied into an email or a WhatsApp message
            to the office without retyping. */}
        <Text
          variant="h2"
          selectable
          style={{ fontFamily: "monospace", letterSpacing: 1.5 }}
        >
          {referenceCode}
        </Text>
        <Text variant="caption" color="secondary">
          {t("tickets.referenceHint")}
        </Text>
      </View>

      {showQr && (
        // White regardless of theme — scanners need the contrast.
        <View className="rounded-xl bg-white p-2">
          <QRCode value={referenceCode} size={68} />
        </View>
      )}
    </View>
  );
}
