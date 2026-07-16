import { useTranslation } from "react-i18next";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Badge, Text, type BadgeTone } from "@/components/ui";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { formatDateTime } from "@/utils/format";

export interface GatePassProps {
  guestName: string;
  /** The scannable token. Also printed underneath as a typed fallback. */
  qrCode: string;
  validFrom: string;
  validTo: string;
  /** e.g. "A-101". */
  flatLabel?: string;
  hostName?: string;
  vehicleNumber?: string | null;
  status?: string;
  statusTone?: BadgeTone;
}

const NOTCH = 22;

/**
 * A guest's gate pass, drawn like a physical ticket: details on the counterfoil
 * up top, a torn perforation, and the scannable stub below. The shape is the
 * point — a guest holding this at a gate should recognise instantly which end
 * to show the guard.
 */
export function GatePass({
  guestName,
  qrCode,
  validFrom,
  validTo,
  flatLabel,
  hostName,
  vehicleNumber,
  status,
  statusTone = "success",
}: GatePassProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // The notches are the page showing through the ticket, so they have to be
  // painted in the screen's background colour rather than be truly transparent.
  const notch = {
    position: "absolute" as const,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: colors.background,
    top: -NOTCH / 2,
  };

  return (
    <View
      className="w-full overflow-hidden"
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassFillStrong,
      }}
    >
      {/* Counterfoil — who the pass is for and when it works. */}
      <View className="gap-3 p-5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="shrink gap-0.5">
            <Text variant="caption" color="tertiary">
              {t("passes.guestName")}
            </Text>
            <Text variant="h2" numberOfLines={2}>
              {guestName}
            </Text>
          </View>
          {status && <Badge label={status} tone={statusTone} size="sm" />}
        </View>

        <View className="flex-row flex-wrap gap-x-6 gap-y-3">
          <View className="gap-0.5">
            <Text variant="caption" color="tertiary">
              {t("passes.validFrom")}
            </Text>
            <Text variant="subtitle">{formatDateTime(validFrom)}</Text>
          </View>
          <View className="gap-0.5">
            <Text variant="caption" color="tertiary">
              {t("passes.validTo")}
            </Text>
            <Text variant="subtitle">{formatDateTime(validTo)}</Text>
          </View>
        </View>

        {(flatLabel || hostName || vehicleNumber) && (
          <View className="flex-row flex-wrap gap-x-6 gap-y-3">
            {flatLabel && (
              <View className="gap-0.5">
                <Text variant="caption" color="tertiary">
                  {t("passes.flat")}
                </Text>
                <Text variant="subtitle">{flatLabel}</Text>
              </View>
            )}
            {hostName && (
              <View className="gap-0.5">
                <Text variant="caption" color="tertiary">
                  {t("passes.host")}
                </Text>
                <Text variant="subtitle">{hostName}</Text>
              </View>
            )}
            {vehicleNumber && (
              <View className="gap-0.5">
                <Text variant="caption" color="tertiary">
                  {t("visitors.vehicle")}
                </Text>
                <Text variant="subtitle">{vehicleNumber}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* The tear line. */}
      <View className="relative h-0">
        <View style={{ ...notch, left: -NOTCH / 2 }} />
        <View style={{ ...notch, right: -NOTCH / 2 }} />
        <View
          className="mx-6"
          style={{
            borderTopWidth: 1.5,
            borderStyle: "dashed",
            borderColor: withAlpha(colors.contentTertiary, 0.5),
          }}
        />
      </View>

      {/* Stub — the end the guard scans. */}
      <View className="items-center gap-3 px-5 pb-5 pt-6">
        {/* Deliberately white regardless of theme: scanners need the contrast. */}
        <View className="rounded-2xl bg-white p-4">
          <QRCode value={qrCode} size={196} />
        </View>

        <View className="items-center gap-1">
          <Text variant="caption" color="tertiary">
            {t("passes.passCode")}
          </Text>
          {/* The fallback that makes the pass work when scanning doesn't:
              the guard can read this out and type it in. */}
          <Text
            variant="subtitle"
            align="center"
            selectable
            style={{ fontFamily: "monospace", letterSpacing: 1.5 }}
          >
            {qrCode}
          </Text>
        </View>

        <Text variant="caption" color="tertiary" align="center">
          {t("passes.qrHint")}
        </Text>
      </View>
    </View>
  );
}
