CREATE TYPE "PreseasonOverrideKind" AS ENUM (
  'LATE_RETURN',
  'MANAGED_MINUTES',
  'UNAVAILABLE',
  'SELECTION_RISK',
  'CONFIRMED_STARTER'
);

CREATE TABLE "preseason_overrides" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "seasonPlayerId" INTEGER NOT NULL UNIQUE REFERENCES "season_players"("id"),
  "kind" "PreseasonOverrideKind" NOT NULL,
  "availabilityCap" INTEGER,
  "startProbabilityCap" DOUBLE PRECISION,
  "expectedMinutesCap" INTEGER,
  "appliesThroughGameweek" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "preseason_overrides_seasonId_active_appliesThroughGameweek_idx"
ON "preseason_overrides"("seasonId", "active", "appliesThroughGameweek");
