import http from "node:http";
import { logger } from "@repo/logger";
import {
  visitorService,
  preApprovalService,
  dueService,
  joinRequestService,
  amenityService,
  subscriptionService,
  noticeService,
} from "@repo/services";
import { app as expressApplication } from "./server";

import { env } from "./env";

const EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Periodic sweep: PENDING visitor requests older than
 * VISITOR_PENDING_TTL_MIN become EXPIRED (guards shouldn't wait forever),
 * ACTIVE pre-approvals whose window lapsed become EXPIRED, PENDING
 * maintenance dues past their dueDate become OVERDUE, chargeable amenity
 * bookings whose payment hold lapsed are released so the slot frees up, and
 * scheduled notices whose publish time has arrived push their residents.
 */
function startExpirySweep() {
  const sweep = async () => {
    try {
      const staleVisitors = await visitorService.expireStalePendingVisitors(
        env.VISITOR_PENDING_TTL_MIN,
      );
      const lapsedPreApprovals = await preApprovalService.expireLapsedPreApprovals();
      const overdueDues = await dueService.markOverdueDues();
      const lapsedJoinRequests = await joinRequestService.expireStaleJoinRequests();
      const { expired: lapsedHolds } = await amenityService.expireLapsedHolds();
      const subs = await subscriptionService.sweepSubscriptions();
      const publishedNotices = await noticeService.publishDueNotices();
      if (
        staleVisitors ||
        lapsedPreApprovals ||
        overdueDues ||
        lapsedJoinRequests ||
        lapsedHolds ||
        subs.grace ||
        subs.expired ||
        publishedNotices
      ) {
        logger.info("Expiry sweep", {
          staleVisitors,
          lapsedPreApprovals,
          overdueDues,
          lapsedJoinRequests,
          lapsedHolds,
          subscriptionsToGrace: subs.grace,
          subscriptionsExpired: subs.expired,
          publishedNotices,
        });
      }
    } catch (err) {
      logger.error("Expiry sweep failed", { err });
    }
  };
  void sweep();
  setInterval(sweep, EXPIRY_SWEEP_INTERVAL_MS);
}

async function init() {
  try {
    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8000;
    server.listen(PORT, () => {
      logger.info(`http server is running on PORT ${PORT}`);
      startExpirySweep();
    });
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
