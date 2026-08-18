CREATE TYPE "RegistrationFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO');
CREATE TYPE "RegistrationFieldVisibility" AS ENUM ('PUBLIC', 'ADMIN_ONLY', 'HIDDEN');

ALTER TABLE "Person"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "addressNormalized" TEXT,
ADD COLUMN "mergedIntoPersonId" TEXT,
ADD COLUMN "mergedAt" TIMESTAMP(3);

ALTER TABLE "Registration"
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "supersededByRegistrationId" TEXT;

ALTER TABLE "Registration" DROP CONSTRAINT "Registration_status_cancelledAt_check";
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_status_lifecycle_check" CHECK (
  ("status" = 'ACTIVE' AND "cancelledAt" IS NULL AND "supersededAt" IS NULL AND "supersededByRegistrationId" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "supersededAt" IS NULL AND "supersededByRegistrationId" IS NULL)
  OR ("status" = 'SUPERSEDED' AND "cancelledAt" IS NULL AND "supersededAt" IS NOT NULL AND "supersededByRegistrationId" IS NOT NULL)
);
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_not_self_superseded_check" CHECK ("supersededByRegistrationId" IS NULL OR "supersededByRegistrationId" <> "id");

CREATE TABLE "EventRegistrationField" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "key" TEXT NOT NULL, "label" TEXT NOT NULL, "helpText" TEXT,
  "type" "RegistrationFieldType" NOT NULL, "visibility" "RegistrationFieldVisibility" NOT NULL DEFAULT 'PUBLIC',
  "isRequired" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRegistrationField_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EventRegistrationFieldOption" (
  "id" TEXT NOT NULL, "fieldId" TEXT NOT NULL, "value" TEXT NOT NULL, "label" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "EventRegistrationFieldOption_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RegistrationFieldAnswer" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventId" TEXT NOT NULL, "registrationId" TEXT NOT NULL, "fieldId" TEXT NOT NULL,
  "value" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationFieldAnswer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PersonMerge" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventId" TEXT, "sourcePersonId" TEXT NOT NULL, "targetPersonId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "reason" TEXT, "sourceSnapshot" JSONB NOT NULL, "targetSnapshot" JSONB NOT NULL, "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonMerge_pkey" PRIMARY KEY ("id"), CONSTRAINT "PersonMerge_not_self_check" CHECK ("sourcePersonId" <> "targetPersonId")
);

CREATE UNIQUE INDEX "EventRegistrationField_eventId_key_key" ON "EventRegistrationField"("eventId", "key");
CREATE INDEX "EventRegistrationField_organizationId_eventId_sortOrder_idx" ON "EventRegistrationField"("organizationId", "eventId", "sortOrder");
CREATE UNIQUE INDEX "EventRegistrationFieldOption_fieldId_value_key" ON "EventRegistrationFieldOption"("fieldId", "value");
CREATE INDEX "EventRegistrationFieldOption_fieldId_sortOrder_idx" ON "EventRegistrationFieldOption"("fieldId", "sortOrder");
CREATE UNIQUE INDEX "RegistrationFieldAnswer_registrationId_fieldId_key" ON "RegistrationFieldAnswer"("registrationId", "fieldId");
CREATE INDEX "RegistrationFieldAnswer_organizationId_eventId_idx" ON "RegistrationFieldAnswer"("organizationId", "eventId");
CREATE INDEX "RegistrationFieldAnswer_eventId_fieldId_idx" ON "RegistrationFieldAnswer"("eventId", "fieldId");
CREATE INDEX "Person_organizationId_addressNormalized_lastName_firstName_idx" ON "Person"("organizationId", "addressNormalized", "lastName", "firstName");
CREATE INDEX "Person_mergedIntoPersonId_idx" ON "Person"("mergedIntoPersonId");
CREATE INDEX "Registration_supersededByRegistrationId_idx" ON "Registration"("supersededByRegistrationId");
CREATE INDEX "PersonMerge_organizationId_createdAt_idx" ON "PersonMerge"("organizationId", "createdAt");
CREATE INDEX "PersonMerge_sourcePersonId_idx" ON "PersonMerge"("sourcePersonId");
CREATE INDEX "PersonMerge_targetPersonId_idx" ON "PersonMerge"("targetPersonId");

ALTER TABLE "Person" ADD CONSTRAINT "Person_mergedIntoPersonId_fkey" FOREIGN KEY ("mergedIntoPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_supersededByRegistrationId_fkey" FOREIGN KEY ("supersededByRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationField" ADD CONSTRAINT "EventRegistrationField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationField" ADD CONSTRAINT "EventRegistrationField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationFieldOption" ADD CONSTRAINT "EventRegistrationFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventRegistrationField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationFieldAnswer" ADD CONSTRAINT "RegistrationFieldAnswer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationFieldAnswer" ADD CONSTRAINT "RegistrationFieldAnswer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationFieldAnswer" ADD CONSTRAINT "RegistrationFieldAnswer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationFieldAnswer" ADD CONSTRAINT "RegistrationFieldAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventRegistrationField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonMerge" ADD CONSTRAINT "PersonMerge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonMerge" ADD CONSTRAINT "PersonMerge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonMerge" ADD CONSTRAINT "PersonMerge_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonMerge" ADD CONSTRAINT "PersonMerge_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonMerge" ADD CONSTRAINT "PersonMerge_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
