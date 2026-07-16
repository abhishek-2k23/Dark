import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

/** Semantic weight of a dialog action; DialogHost maps it to a Button variant. */
export type DialogTone = "primary" | "secondary" | "danger" | "neutral";

export interface DialogAction {
  label: string;
  tone?: DialogTone;
  /** Runs after the dialog closes. Omit for a plain cancel. */
  onPress?: () => void;
}

/**
 * An app-themed replacement for Alert.alert — the OS dialog ignores the app's
 * theme entirely. Rendered by DialogHost in the root layout.
 */
export interface DialogSpec {
  title: string;
  message?: string;
  actions: DialogAction[];
}

interface UIState {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  dialog: DialogSpec | null;
  showDialog: (spec: DialogSpec) => void;
  dismissDialog: () => void;
}

/** Auto-dismiss delay for toasts (ms). */
const TOAST_TTL = 3200;

export const useUIStore = create<UIState>((set) => ({
  toasts: [],

  showToast: (message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, TOAST_TTL);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  dialog: null,
  // Last write wins: a second dialog replaces the first rather than queueing —
  // stacked confirmations are never what anyone wants.
  showDialog: (spec) => set({ dialog: spec }),
  dismissDialog: () => set({ dialog: null }),
}));
