ALTER TABLE "Event"
ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'Fundraising event',
ADD COLUMN "contactName" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "brandingPrimaryColor" TEXT NOT NULL DEFAULT '#173a32',
ADD COLUMN "brandingLogoUrl" TEXT;
