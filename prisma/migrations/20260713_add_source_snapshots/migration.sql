CREATE TABLE "source_snapshots" (
  "id" SERIAL NOT NULL,
  "source" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "sourceSeasonId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "checksum" TEXT NOT NULL,
  "valid" BOOLEAN NOT NULL,
  "error" TEXT,
  "recordCount" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_snapshots_batchId_dataset_key"
ON "source_snapshots"("batchId", "dataset");

CREATE INDEX "source_snapshots_source_dataset_season_fetchedAt_idx"
ON "source_snapshots"("source", "dataset", "season", "fetchedAt");

CREATE INDEX "source_snapshots_batchId_idx"
ON "source_snapshots"("batchId");
