import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { Button, Icon, IconCircle, Text } from "@/components/ui";
import { useTheme } from "@/theme";

export interface PassScannerProps {
  visible: boolean;
  onClose: () => void;
  /** Fired once per opening with the raw scanned payload. */
  onScanned: (value: string) => void;
}

/** Side of the square cut-out the guest's QR should be framed in. */
const FRAME = 240;

/**
 * Full-screen QR reader for gate passes. Deliberately single-shot: the first
 * successful read closes the camera and hands the value up, because a QR sitting
 * in frame fires `onBarcodeScanned` continuously and re-submitting the same pass
 * would race the verify mutation against itself.
 *
 * Permission is requested on open rather than on mount — a guard who never opens
 * the scanner is never asked for the camera.
 */
export function PassScanner({ visible, onClose, onScanned }: PassScannerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);

  // Latches on the first read so the burst of duplicate callbacks that follows
  // is dropped.
  const handled = useRef(false);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  // Every exit routes through here, so this is where the sheet is returned to
  // its opening state — cheaper and less surprising than a `visible` effect
  // reaching back in to reset state React already owns.
  const close = () => {
    handled.current = false;
    setTorch(false);
    onClose();
  };

  const handleScan = (value: string) => {
    if (handled.current) return;
    handled.current = true;
    onScanned(value);
    close();
  };

  const granted = permission?.granted ?? false;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View className="flex-1" style={{ backgroundColor: "#000" }}>
        {granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handleScan(data)}
          />
        ) : (
          // Permission denied for good (or still undetermined on a device that
          // won't prompt) — the manual code entry behind this sheet still works,
          // so this is a dead end, not a blocker.
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <IconCircle name="camera-outline" tone="neutral" size={64} />
            <Text variant="title" align="center" style={{ color: "#fff" }}>
              {t("guard.scanPermissionTitle")}
            </Text>
            <Text variant="body" align="center" style={{ color: "#ffffffcc" }}>
              {t("guard.scanPermissionBody")}
            </Text>
            {permission?.canAskAgain && (
              <Button
                label={t("guard.scanPermissionCta")}
                variant="primary"
                onPress={() => void requestPermission()}
              />
            )}
          </View>
        )}

        {/* Overlay chrome. Sits above the camera surface, so it must not
            intercept touches outside its own controls. */}
        <View className="absolute inset-0" pointerEvents="box-none">
          {granted && (
            <View className="flex-1 items-center justify-center" pointerEvents="none">
              <View
                style={{
                  width: FRAME,
                  height: FRAME,
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: colors.primary,
                }}
              />
              <Text
                variant="body"
                align="center"
                className="mt-5 px-10"
                style={{ color: "#ffffffdd" }}
              >
                {t("guard.scanHint")}
              </Text>
            </View>
          )}

          {/* Close, top-left, clear of the notch. */}
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityLabel={t("common.close")}
            className="absolute left-5 top-16 h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: "#00000099" }}
          >
            <Icon name="close" size={24} color="#fff" />
          </Pressable>

          {granted && (
            <Pressable
              onPress={() => setTorch((on) => !on)}
              hitSlop={12}
              accessibilityLabel={t("guard.torch")}
              className="absolute right-5 top-16 h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              style={{ backgroundColor: torch ? colors.primary : "#00000099" }}
            >
              <Icon name={torch ? "flashlight" : "flashlight-outline"} size={22} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
