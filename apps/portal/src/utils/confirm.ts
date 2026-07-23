import { useUIStore, type DialogTone } from "@/stores/uiStore";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label for the action that proceeds (e.g. "Log out", "Cancel booking"). */
  confirmLabel: string;
  /** Label for the safe way out. */
  cancelLabel: string;
  /** Weight of the confirm button — `danger` for destructive, `primary` otherwise. */
  tone?: Extract<DialogTone, "danger" | "primary">;
  /** Runs after the dialog closes, only if the user confirmed. */
  onConfirm: () => void;
}

/**
 * Standard two-button confirmation on top of the themed DialogHost. Keeps
 * sensitive actions (logout, cancellations, deletions, payments) one call away
 * from a guarded confirm, so call sites don't each re-spell the dialog shape.
 * The confirm button sits above the cancel, matching the app's existing
 * destructive dialogs.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onConfirm,
}: ConfirmOptions) {
  useUIStore.getState().showDialog({
    title,
    message,
    actions: [
      { label: confirmLabel, tone, onPress: onConfirm },
      { label: cancelLabel, tone: "neutral" },
    ],
  });
}
