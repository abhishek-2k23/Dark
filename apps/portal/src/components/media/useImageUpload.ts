import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import {
  FileTooLargeError,
  PermissionDeniedError,
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
        } else {
          showToast(toErrorMessage(err, t), "error");
        }
      } finally {
        setBusy(false);
      }
    },
    [showToast, t],
  );

  const start = useCallback(() => {
    if (busy) return;
    const { forceSource } = latest.current;
    if (forceSource) {
      void run(forceSource);
      return;
    }
    Alert.alert(t("media.sourceTitle"), undefined, [
      { text: t("media.camera"), onPress: () => void run("camera") },
      { text: t("media.gallery"), onPress: () => void run("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [busy, run, t]);

  return { busy, start };
}
