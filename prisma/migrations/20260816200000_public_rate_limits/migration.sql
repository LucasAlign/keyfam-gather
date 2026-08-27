CREATE TABLE "PublicRateLimit" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRateLimit_pkey" PRIMARY KEY ("key", "windowStart")
);

CREATE INDEX "PublicRateLimit_expiresAt_idx" ON "PublicRateLimit"("expiresAt");
