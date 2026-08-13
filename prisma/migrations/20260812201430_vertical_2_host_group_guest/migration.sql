CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventHost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventHost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HostAccessToken" (
    "id" TEXT NOT NULL,
    "eventHostId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HostAccessToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD COLUMN "eventHostId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "groupId" TEXT;

CREATE INDEX "Group_organizationId_eventId_idx" ON "Group"("organizationId", "eventId");
CREATE UNIQUE INDEX "Group_eventId_name_key" ON "Group"("eventId", "name");
CREATE INDEX "EventHost_organizationId_eventId_idx" ON "EventHost"("organizationId", "eventId");
CREATE INDEX "EventHost_groupId_idx" ON "EventHost"("groupId");
CREATE UNIQUE INDEX "EventHost_eventId_personId_key" ON "EventHost"("eventId", "personId");
CREATE UNIQUE INDEX "HostAccessToken_tokenHash_key" ON "HostAccessToken"("tokenHash");
CREATE INDEX "HostAccessToken_eventHostId_expiresAt_idx" ON "HostAccessToken"("eventHostId", "expiresAt");
CREATE INDEX "Registration_groupId_idx" ON "Registration"("groupId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventHost" ADD CONSTRAINT "EventHost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventHost" ADD CONSTRAINT "EventHost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventHost" ADD CONSTRAINT "EventHost_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventHost" ADD CONSTRAINT "EventHost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HostAccessToken" ADD CONSTRAINT "HostAccessToken_eventHostId_fkey" FOREIGN KEY ("eventHostId") REFERENCES "EventHost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventHostId_fkey" FOREIGN KEY ("eventHostId") REFERENCES "EventHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
