-- Add restricted event-night staffing roles (issue #18).
ALTER TYPE "EventRole" ADD VALUE 'CHECKIN_LEAD';
ALTER TYPE "EventRole" ADD VALUE 'VOLUNTEER';
