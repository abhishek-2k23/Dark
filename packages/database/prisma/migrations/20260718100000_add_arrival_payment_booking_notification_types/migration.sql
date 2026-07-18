-- Cross-role notifications for the remaining flows: a guest/visitor checked in
-- at the gate (→ resident), an offline receipt awaiting verification (→ admins),
-- and a cancelled amenity booking (→ admins).
ALTER TYPE "NotificationType" ADD VALUE 'VISITOR_ARRIVED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELLED';
