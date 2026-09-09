ALTER TABLE "Event" ADD COLUMN "budgetCents" INTEGER CHECK ("budgetCents" >= 0);
CREATE TABLE "EventExpense" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "vendor" TEXT NOT NULL DEFAULT '',
  "plannedCents" INTEGER NOT NULL CHECK ("plannedCents" >= 0),
  "actualCents" INTEGER CHECK ("actualCents" >= 0)
);
CREATE INDEX "EventExpense_eventId_idx" ON "EventExpense"("eventId");
CREATE TABLE "EventQuickLink" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL
);
CREATE INDEX "EventQuickLink_eventId_idx" ON "EventQuickLink"("eventId");
