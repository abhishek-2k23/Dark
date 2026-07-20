import { create } from "zustand";

export type EmergencyType = "MEDICAL" | "FIRE" | "SECURITY" | "OTHER";

/** How the SOS sheet was opened — it changes what the sheet does on open. */
export type SosTrigger = "shake" | "manual";

interface EmergencyState {
  /** Null when the sheet is closed. */
  trigger: SosTrigger | null;
  /** What will be broadcast; editable while the countdown runs. */
  type: EmergencyType;
  open: (trigger: SosTrigger) => void;
  setType: (type: EmergencyType) => void;
  close: () => void;
}

/**
 * Drives the one SOS sheet from two places: the shake detector and the manual
 * SOS button. Kept in a store rather than local state because the shake can
 * happen on any screen, so the sheet lives at the root and needs opening from
 * anywhere.
 */
export const useEmergencyStore = create<EmergencyState>((set) => ({
  trigger: null,
  // A shake carries no information about what is wrong, so the broadcast
  // defaults to OTHER and the user narrows it while the countdown runs.
  type: "OTHER",
  open: (trigger) => set({ trigger, type: "OTHER" }),
  setType: (type) => set({ type }),
  close: () => set({ trigger: null }),
}));
