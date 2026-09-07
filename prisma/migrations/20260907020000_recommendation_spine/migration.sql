CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DISMISSED', 'SNOOZED', 'EXECUTED', 'SUPERSEDED');

CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "dedupeKey" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Recommendation_eventId_dedupeKey_sourceFingerprint_key" ON "Recommendation"("eventId", "dedupeKey", "sourceFingerprint");
CREATE INDEX "Recommendation_organizationId_eventId_status_snoozedUntil_idx" ON "Recommendation"("organizationId", "eventId", "status", "snoozedUntil");
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
