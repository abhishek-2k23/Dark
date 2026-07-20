import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { notificationHref } from "@/utils/domain";

/**
 * Bridges OS-level notification events into the app. Renders nothing.
 *
 *  - A push received while the app is foregrounded refreshes the inbox + badge
 *    AND the feature data the push is about, so open screens update live. The OS
 *    banner is suppressed in that case (see `push.ts`), so this is also what
 *    surfaces the push at all: a toast in the app's own idiom.
 *  - A join-request approval also refreshes the session: the fresh `societyId`
 *    is what moves a user off the no-society gate without a restart.
 *  - Tapping a push deep-links to the relevant screen for the caller's role,
 *    including the cold-start case where the tap launched the app from killed.
 *
 * Mounted once at the root, inside the tRPC + router providers.
 */
export function NotificationsListener() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const role = useAuthStore((s) => s.user?.role);

  // Keep the newest role in a ref so the subscription effect can stay mounted
  // once (no re-subscribe churn) and still read the current role when a tap
  // fires. The push payload carries `type`; ids live alongside it in `data`.
  const roleRef = useRef(role);
  roleRef.current = role;

  /** Refetch whatever feature data a push of this `type` just made stale. */
  const invalidateFor = (type: string) => {
    void utils.notification.list.invalidate();
    if (type.startsWith("TICKET")) void utils.ticket.invalidate();
    else if (type.startsWith("VISITOR")) {
      void utils.visitor.invalidate();
      void utils.guestPreApproval.invalidate();
    } else if (type === "PRE_APPROVAL_CREATED") {
      // A guard's gate queue — the pass has to appear there without a pull.
      void utils.guestPreApproval.invalidate();
    } else if (type.startsWith("PAYMENT") || type === "DUE_GENERATED") {
      void utils.due.invalidate();
      void utils.payment.invalidate();
    } else if (type.startsWith("BOOKING")) void utils.amenityBooking.invalidate();
    else if (type === "NOTICE_PUBLISHED") void utils.notice.invalidate();
    else if (type === "POLL_CREATED") void utils.poll.invalidate();
    else if (type.startsWith("JOIN_REQUEST")) {
      void utils.joinRequest.invalidate();
      // Approval attaches a society to the account — only a session refresh
      // carries the new societyId into the auth store, which is what routes
      // the user off the no-society gate (or into the admin's queue count).
      if (type === "JOIN_REQUEST_APPROVED") {
        void useAuthStore.getState().refresh();
      }
    }
  };

  const routeTo = (response: Notifications.NotificationResponse) => {
    const currentRole = roleRef.current;
    if (!currentRole) return; // signed out — nowhere to route
    const data = (response.notification.request.content.data ?? {}) as Record<
      string,
      unknown
    >;
    const type = typeof data.type === "string" ? data.type : "";
    // The inbox is now (or soon) stale — the tapped push is at least read-worthy.
    invalidateFor(type);
    const href = notificationHref(currentRole, type, data);
    if (href) router.push(href as never);
  };

  // Foreground receipts + taps while the app is running or backgrounded.
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body, data: raw } = notification.request.content;
        const data = (raw ?? {}) as Record<string, unknown>;
        invalidateFor(typeof data.type === "string" ? data.type : "");

        // The OS banner is off in the foreground, so announce it ourselves.
        // Title alone when there is one: it is already written as the headline,
        // and a toast has no room for both.
        const message = title || body;
        if (message) useUIStore.getState().showToast(message, "info");
      },
    );
    const responseSub =
      Notifications.addNotificationResponseReceivedListener(routeTo);
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold start: a tap that launched the app from a killed state isn't delivered
  // to the listener above. Read it once, but only after the role has hydrated so
  // there's a destination to route to.
  const handledColdStart = useRef(false);
  useEffect(() => {
    if (!role || handledColdStart.current) return;
    handledColdStart.current = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeTo(response);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return null;
}
