CREATE TYPE "AttendanceOperationKind" AS ENUM ('CHECK_IN', 'UNDO');
CREATE TYPE "AttendanceDisposition" AS ENUM ('APPLIED', 'ALREADY_APPLIED', 'CONFLICT', 'REJECTED');
CREATE TYPE "AttendanceResultCode" AS ENUM ('ALREADY_CHECKED_IN', 'ALREADY_REVERSED', 'UNDO_EXPIRED', 'STALE_VERSION', 'NOT_FOUND', 'FORBIDDEN', 'OPERATION_ID_REUSED');

ALTER TABLE "CheckIn" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "AttendanceOperation" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "kind" "AttendanceOperationKind" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "expectedVersion" INTEGER,
  "disposition" "AttendanceDisposition" NOT NULL,
  "resultCode" "AttendanceResultCode",
  "commandHash" TEXT NOT NULL,
  "canonicalResult" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceOperation_operationId_key" ON "AttendanceOperation"("operationId");
CREATE INDEX "AttendanceOperation_organizationId_eventId_createdAt_idx" ON "AttendanceOperation"("organizationId", "eventId", "createdAt");
CREATE INDEX "AttendanceOperation_eventId_deviceId_createdAt_idx" ON "AttendanceOperation"("eventId", "deviceId", "createdAt");
CREATE INDEX "AttendanceOperation_registrationId_createdAt_idx" ON "AttendanceOperation"("registrationId", "createdAt");

ALTER TABLE "AttendanceOperation" ADD CONSTRAINT "AttendanceOperation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOperation" ADD CONSTRAINT "AttendanceOperation_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOperation" ADD CONSTRAINT "AttendanceOperation_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOperation" ADD CONSTRAINT "AttendanceOperation_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
