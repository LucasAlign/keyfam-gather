CREATE TABLE "SeatingTable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeatingTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Registration" ADD COLUMN "tableId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "partyId" TEXT;

CREATE INDEX "SeatingTable_organizationId_eventId_idx" ON "SeatingTable"("organizationId", "eventId");
CREATE UNIQUE INDEX "SeatingTable_eventId_name_key" ON "SeatingTable"("eventId", "name");
CREATE INDEX "Party_organizationId_eventId_idx" ON "Party"("organizationId", "eventId");
CREATE UNIQUE INDEX "Party_eventId_name_key" ON "Party"("eventId", "name");
CREATE INDEX "Registration_tableId_idx" ON "Registration"("tableId");
CREATE INDEX "Registration_partyId_idx" ON "Registration"("partyId");

ALTER TABLE "SeatingTable" ADD CONSTRAINT "SeatingTable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatingTable" ADD CONSTRAINT "SeatingTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "SeatingTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
