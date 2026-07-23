CREATE TABLE "season_source_bindings" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "source" TEXT NOT NULL,
  "externalSeasonId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "metadata" JSONB,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "season_source_bindings_seasonId_source_key"
ON "season_source_bindings"("seasonId", "source");
CREATE UNIQUE INDEX "season_source_bindings_source_externalSeasonId_key"
ON "season_source_bindings"("source", "externalSeasonId");
CREATE INDEX "season_source_bindings_source_verifiedAt_idx"
ON "season_source_bindings"("source", "verifiedAt");

INSERT INTO "season_source_bindings" (
  "seasonId", "source", "externalSeasonId", "label", "metadata",
  "verifiedAt", "createdAt", "updatedAt"
)
SELECT
  s."id", 'pulselive', '777', '2025/26',
  '{"backfilledFrom":"source_snapshots"}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "seasons" s
WHERE s."code" = '2025/26'
  AND EXISTS (
    SELECT 1 FROM "source_snapshots" ss
    WHERE ss."seasonId" = s."id"
      AND ss."source" = 'pulselive'
      AND ss."sourceSeasonId" = '777'
  )
ON CONFLICT ("seasonId", "source") DO NOTHING;
