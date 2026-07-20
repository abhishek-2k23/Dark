import * as Haptics from "expo-haptics";
import { useCallback } from "react";

import { EmergencyBanner } from "@/components/EmergencyBanner";
import { EmergencySheet } from "@/components/EmergencySheet";
import { useShakeDetector } from "@/hooks/useShakeDetector";
import { useAuthStore } from "@/stores/authStore";
import { useEmergencyStore } from "@/stores/emergencyStore";

/**
 * Mounts the panic alarm: shake-to-trigger, the countdown sheet, and the live
 * alarm banner. Rendered once at the root so a shake works on any screen.
 *
 * The accelerometer only runs for a signed-in member of a society — there is
 * nobody to alarm otherwise, and an idle sensor subscription is a battery cost
 * with no upside. It also stops while the sheet is already up, so a continuing
 * shake can't re-trigger what's already counting down.
 */
export function EmergencyHost() {
  const societyId = useAuthStore((s) => s.user?.societyId);
  const sheetOpen = useEmergencyStore((s) => s.trigger !== null);
  const open = useEmergencyStore((s) => s.open);

  const onShake = useCallback(() => {
    // Confirm the gesture registered before the sheet paints — in a real
    // emergency the phone may be out of view.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    open("shake");
  }, [open]);

  useShakeDetector(onShake, { enabled: Boolean(societyId) && !sheetOpen });

  if (!societyId) return null;

  return (
    <>
      <EmergencyBanner />
      <EmergencySheet />
    </>
  );
}
