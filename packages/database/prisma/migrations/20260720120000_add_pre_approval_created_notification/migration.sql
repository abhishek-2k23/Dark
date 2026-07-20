-- A resident issuing a guest pass now notifies the society's guards, so the
-- expected guest is on the gate's radar before they arrive.
ALTER TYPE "NotificationType" ADD VALUE 'PRE_APPROVAL_CREATED';
