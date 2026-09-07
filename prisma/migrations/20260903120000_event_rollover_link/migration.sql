-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "rolledOverFromEventId" TEXT;

-- CreateIndex
CREATE INDEX "Event_rolledOverFromEventId_idx" ON "Event"("rolledOverFromEventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_rolledOverFromEventId_fkey" FOREIGN KEY ("rolledOverFromEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

