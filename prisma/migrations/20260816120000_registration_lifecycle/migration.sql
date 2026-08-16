CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "Registration"
ADD COLUMN "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "Registration_organizationId_eventId_status_idx"
ON "Registration"("organizationId", "eventId", "status");

ALTER TABLE "Registration"
ADD CONSTRAINT "Registration_status_cancelledAt_check"
CHECK (
  ("status" = 'ACTIVE' AND "cancelledAt" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
);
