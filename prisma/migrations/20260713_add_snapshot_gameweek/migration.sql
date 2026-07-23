ALTER TABLE "source_snapshots"
ADD COLUMN "gameweek" INTEGER;

CREATE INDEX "source_snapshots_source_season_gameweek_idx"
ON "source_snapshots"("source", "season", "gameweek");

-- The first successful 2025/26 batch was captured after GW38 had settled.
UPDATE "source_snapshots"
SET "gameweek" = 38
WHERE "source" = 'pulselive'
  AND "season" = '2025/26'
  AND "valid" = TRUE;
