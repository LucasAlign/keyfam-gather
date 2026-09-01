-- First-class sponsors keep fundraising, guest allotments, and fulfillment in one event record.
CREATE TYPE "SponsorshipFulfillmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED');
ALTER TABLE "FundraisingCommitment" ADD COLUMN "groupId" TEXT;
CREATE INDEX "FundraisingCommitment_groupId_idx" ON "FundraisingCommitment"("groupId");
ALTER TABLE "FundraisingCommitment" ADD CONSTRAINT "FundraisingCommitment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Sponsor" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "primaryContactPersonId" TEXT,
  "logoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sponsorship" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sponsorId" TEXT NOT NULL,
  "commitmentId" TEXT NOT NULL,
  "groupId" TEXT,
  "level" TEXT NOT NULL,
  "guestAllotment" INTEGER NOT NULL DEFAULT 0,
  "benefits" TEXT,
  "recognitionNeeds" TEXT,
  "fulfillmentStatus" "SponsorshipFulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "fulfillmentNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sponsor_eventId_name_key" ON "Sponsor"("eventId", "name");
CREATE INDEX "Sponsor_organizationId_eventId_idx" ON "Sponsor"("organizationId", "eventId");
CREATE INDEX "Sponsor_primaryContactPersonId_idx" ON "Sponsor"("primaryContactPersonId");
CREATE UNIQUE INDEX "Sponsorship_commitmentId_key" ON "Sponsorship"("commitmentId");
CREATE INDEX "Sponsorship_organizationId_eventId_fulfillmentStatus_idx" ON "Sponsorship"("organizationId", "eventId", "fulfillmentStatus");
CREATE INDEX "Sponsorship_sponsorId_idx" ON "Sponsorship"("sponsorId");
CREATE INDEX "Sponsorship_groupId_idx" ON "Sponsorship"("groupId");
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_primaryContactPersonId_fkey" FOREIGN KEY ("primaryContactPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FundraisingCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
