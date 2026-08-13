-- PostgreSQL does not allow a newly added enum value to be used until the
-- transaction that added it commits. Prisma deploys each migration in one
-- transaction, so replace the enum before migrating legacy event roles.
ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";
CREATE TYPE "MembershipRole" AS ENUM ('ORGANIZATION_ADMIN', 'EVENT_ADMIN', 'EVENT_STAFF', 'HOST', 'GUEST', 'VIEWER', 'MEMBER');
ALTER TABLE "Membership"
  ALTER COLUMN "role" TYPE "MembershipRole"
  USING ("role"::text::"MembershipRole");
DROP TYPE "MembershipRole_old";

CREATE TYPE "EventRole" AS ENUM ('EVENT_ADMIN', 'EVENT_STAFF');

CREATE TABLE "EventAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" "EventRole" NOT NULL,
    CONSTRAINT "EventAssignment_pkey" PRIMARY KEY ("id")
);

-- Preserve the access legacy organization-wide event roles had to existing events,
-- then prevent those memberships from granting access to future events.
INSERT INTO "EventAssignment" ("id", "userId", "organizationId", "eventId", "role")
SELECT CONCAT('migrated-', m."id", '-', e."id"), m."userId", m."organizationId", e."id",
       CASE m."role"::text
         WHEN 'EVENT_ADMIN' THEN 'EVENT_ADMIN'::"EventRole"
         ELSE 'EVENT_STAFF'::"EventRole"
       END
FROM "Membership" m
JOIN "Event" e ON e."organizationId" = m."organizationId"
WHERE m."role"::text IN ('EVENT_ADMIN', 'EVENT_STAFF');

UPDATE "Membership"
SET "role" = 'MEMBER'
WHERE "role"::text IN ('EVENT_ADMIN', 'EVENT_STAFF');

CREATE UNIQUE INDEX "EventAssignment_userId_eventId_key" ON "EventAssignment"("userId", "eventId");
CREATE INDEX "EventAssignment_organizationId_eventId_idx" ON "EventAssignment"("organizationId", "eventId");

ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAssignment" ADD CONSTRAINT "EventAssignment_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
