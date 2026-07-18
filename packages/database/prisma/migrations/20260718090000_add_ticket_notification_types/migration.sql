-- Ticket lifecycle notifications beyond status changes: a raise fanned out to
-- the society's admins, and an assignment sent to the assignee and resident.
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_RAISED';
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_ASSIGNED';
