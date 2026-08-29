CREATE TYPE "FundraisingCommitmentKind" AS ENUM ('DONATION', 'PLEDGE', 'SPONSORSHIP', 'TICKET');
CREATE TYPE "FundraisingCommitmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "FinancialTransactionKind" AS ENUM ('PAYMENT', 'REFUND');

ALTER TABLE "Event"
  ADD COLUMN "fundraisingGoalCents" INTEGER,
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'USD';

CREATE TABLE "FundraisingCommitment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "personId" TEXT,
  "kind" "FundraisingCommitmentKind" NOT NULL,
  "status" "FundraisingCommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "amountCents" INTEGER NOT NULL,
  "description" TEXT,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundraisingCommitment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "commitmentId" TEXT NOT NULL,
  "kind" "FinancialTransactionKind" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FundraisingCommitment_organizationId_eventId_status_idx" ON "FundraisingCommitment"("organizationId", "eventId", "status");
CREATE INDEX "FundraisingCommitment_personId_idx" ON "FundraisingCommitment"("personId");
CREATE INDEX "FinancialTransaction_organizationId_eventId_occurredAt_idx" ON "FinancialTransaction"("organizationId", "eventId", "occurredAt");
CREATE INDEX "FinancialTransaction_commitmentId_occurredAt_idx" ON "FinancialTransaction"("commitmentId", "occurredAt");

ALTER TABLE "FundraisingCommitment" ADD CONSTRAINT "FundraisingCommitment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundraisingCommitment" ADD CONSTRAINT "FundraisingCommitment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundraisingCommitment" ADD CONSTRAINT "FundraisingCommitment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FundraisingCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FundraisingCommitment" ADD CONSTRAINT "FundraisingCommitment_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Event" ADD CONSTRAINT "Event_fundraisingGoalCents_positive" CHECK ("fundraisingGoalCents" IS NULL OR "fundraisingGoalCents" > 0);
