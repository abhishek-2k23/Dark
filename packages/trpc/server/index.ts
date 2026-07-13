import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { societyRouter, towerRouter, flatRouter } from "./routes/society/route";
import { residentRouter } from "./routes/resident/route";
import { staffRouter } from "./routes/staff/route";
import { profileRouter, familyMemberRouter, vehicleRouter } from "./routes/profile/route";
import { visitorRouter, guestPreApprovalRouter } from "./routes/visitor/route";
import { ticketRouter } from "./routes/helpdesk/route";
import { noticeRouter } from "./routes/notice/route";
import { pollRouter } from "./routes/poll/route";
import { amenityRouter, amenityBookingRouter } from "./routes/amenity/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  society: societyRouter,
  tower: towerRouter,
  flat: flatRouter,
  resident: residentRouter,
  staff: staffRouter,
  profile: profileRouter,
  familyMember: familyMemberRouter,
  vehicle: vehicleRouter,
  visitor: visitorRouter,
  guestPreApproval: guestPreApprovalRouter,
  ticket: ticketRouter,
  notice: noticeRouter,
  poll: pollRouter,
  amenity: amenityRouter,
  amenityBooking: amenityBookingRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
