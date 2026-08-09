CREATE TABLE "preseason_squad_drafts" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "name" TEXT NOT NULL,
  "playerIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "starterIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "captainId" INTEGER,
  "viceCaptainId" INTEGER,
  "bank" INTEGER NOT NULL DEFAULT 0,
  "previewSnapshotId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "preseason_squad_drafts_seasonId_updatedAt_idx"
ON "preseason_squad_drafts"("seasonId", "updatedAt");
