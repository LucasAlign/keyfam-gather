CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckIn_registrationId_key" ON "CheckIn"("registrationId");
CREATE INDEX "CheckIn_organizationId_eventId_reversedAt_idx" ON "CheckIn"("organizationId", "eventId", "reversedAt");
CREATE INDEX "CheckIn_eventId_checkedInAt_idx" ON "CheckIn"("eventId", "checkedInAt");
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
