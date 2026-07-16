import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  FileTooLargeError,
  PermissionDeniedError,
  UploadFailedError,
  pickAndUploadImage,
  pickAndUploadImages,
  type PickOptions,
  type PickSource,
  type UploadKind,
} from "@/lib/upload";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

export interface UseImageUploadOptions extends PickOptions {
  /** Picks the Cloudinary folder + transformation. */
  kind: UploadKind;
  /** Called with the Cloudinary URL(s) once the upload lands. */
  onUploaded: (urls: string[]) => void;
  /**
   * Skip the camera/gallery prompt and go straight to this source. Set
   * "camera" where a live photo is the point (a guard at the gate) and a
   * gallery pick would defeat it.
   */
  forceSource?: PickSource;
}

export interface UseImageUpload {
  /** True from the moment the picker opens until the upload resolves. */
  busy: boolean;
  /** Ask for a source (or use forceSource), then pick + upload. */
  start: () => void;
}

/**
 * The shared pick → upload → report loop behind every image field: source
 * prompt, permissions, upload, and error toasts in one place so each screen
 * only has to say what to do with the resulting URL.
 */
export function useImageUpload(options: UseImageUploadOptions): UseImageUpload {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  // Callers pass inline object/callback props, so reading them through a ref
  // keeps `start` stable instead of rebuilding it on every render.
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(
    async (source: PickSource) => {
      const {
        kind,
        onUploaded,
        forceSource: _ignored,
        selectionLimit = 1,
        ...pickOptions
      } = latest.current;

      setBusy(true);
      try {
        const opts: PickOptions = { ...pickOptions, selectionLimit };
        const urls =
          selectionLimit > 1
            ? await pickAndUploadImages(kind, source, opts)
            : await pickAndUploadImage(kind, source, opts).then((u) => (u ? [u] : []));
        // Empty means the user backed out of the picker — say nothing.
        if (urls.length > 0) onUploaded(urls);
      } catch (err) {
        if (err instanceof PermissionDeniedError) {
          showToast(t(`media.permission.${err.source}`), "error");
        } else if (err instanceof FileTooLargeError) {
          showToast(t("media.tooLarge"), "error");
        } else if (err instanceof UploadFailedError) {
          // Cloudinary answered and said no. Show its reason: toErrorMessage
          // would see no httpStatus on it and wrongly report a dead network,
          // hiding the only thing that explains the failure.
          showToast(t("media.uploadFailed", { reason: err.message }), "error");
        } else {
          // Everything else: a genuine transport failure, or a tRPC error from
          // getSignature (which carries httpStatus and a curated message).
          const friendly = toErrorMessage(err, t);
          // toErrorMessage exists to hide the raw cause from users — which is
          // precisely wrong while debugging, so keep it on screen in dev.
          if (__DEV__) console.log("[Upload] unhandled failure:", err);
          showToast(__DEV__ ? `${friendly} · ${String(err)}` : friendly, "error");
        }
      } finally {
        setBusy(false);
      }
    },
    [showToast, t],
  );

  const showDialog = useUIStore((s) => s.showDialog);

  const start = useCallback(() => {
    if (busy) return;
    const { forceSource } = latest.current;
    if (forceSource) {
      void run(forceSource);
      return;
    }
    showDialog({
      title: t("media.sourceTitle"),
      actions: [
        { label: t("media.camera"), tone: "primary", onPress: () => void run("camera") },
        { label: t("media.gallery"), tone: "secondary", onPress: () => void run("library") },
        { label: t("common.cancel"), tone: "neutral" },
      ],
    });
  }, [busy, run, showDialog, t]);

  return { busy, start };
}
