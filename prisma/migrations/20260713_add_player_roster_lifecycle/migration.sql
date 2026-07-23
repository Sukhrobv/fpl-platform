ALTER TABLE "players"
ADD COLUMN "season" TEXT NOT NULL DEFAULT '2025/26',
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastSeenAt" TIMESTAMP(3);

UPDATE "players"
SET "firstSeenAt" = "createdAt",
    "lastSeenAt" = COALESCE("lastSyncedAt", "updatedAt");

CREATE INDEX "players_season_active_idx" ON "players"("season", "active");
