import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { accountRouter } from "./routes/account/route";
import { societyRouter, towerRouter, flatRouter } from "./routes/society/route";
import { joinRequestRouter } from "./routes/society/join-request.route";
import { residentRouter } from "./routes/resident/route";
import { staffRouter } from "./routes/staff/route";
import { profileRouter, familyMemberRouter, vehicleRouter } from "./routes/profile/route";
import { visitorRouter, guestPreApprovalRouter, gateRouter } from "./routes/visitor/route";
import { ticketRouter } from "./routes/helpdesk/route";
import { noticeRouter } from "./routes/notice/route";
import { pollRouter } from "./routes/poll/route";
import { amenityRouter, amenityBookingRouter } from "./routes/amenity/route";
import { dueRouter, paymentRouter, serviceBillRouter } from "./routes/dues/route";
import { serviceProviderRouter } from "./routes/directory/route";
import { pushTokenRouter, notificationRouter } from "./routes/notification/route";
import { uploadRouter } from "./routes/upload/route";
import { planRouter, subscriptionRouter } from "./routes/subscription/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  account: accountRouter,
  society: societyRouter,
  joinRequest: joinRequestRouter,
  tower: towerRouter,
  flat: flatRouter,
  resident: residentRouter,
  staff: staffRouter,
  profile: profileRouter,
  familyMember: familyMemberRouter,
  vehicle: vehicleRouter,
  visitor: visitorRouter,
  guestPreApproval: guestPreApprovalRouter,
  gate: gateRouter,
  ticket: ticketRouter,
  notice: noticeRouter,
  poll: pollRouter,
  amenity: amenityRouter,
  amenityBooking: amenityBookingRouter,
  due: dueRouter,
  payment: paymentRouter,
  serviceBill: serviceBillRouter,
  serviceProvider: serviceProviderRouter,
  pushToken: pushTokenRouter,
  notification: notificationRouter,
  upload: uploadRouter,
  plan: planRouter,
  subscription: subscriptionRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
