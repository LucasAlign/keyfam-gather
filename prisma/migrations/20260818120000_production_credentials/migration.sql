-- Production authentication: per-user password hashes and revocable sessions.
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;
