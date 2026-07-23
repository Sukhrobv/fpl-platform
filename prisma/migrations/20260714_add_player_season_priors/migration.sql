CREATE TYPE "CalibrationStatus" AS ENUM ('NOT_RUN', 'PASSED', 'FAILED');
CREATE TYPE "EvidenceFreezeStatus" AS ENUM ('FROZEN', 'SUPERSEDED');
CREATE TYPE "PriorConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "prediction_config_versions" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL UNIQUE,
  "sourceSeasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "config" JSONB NOT NULL,
  "calibrationStatus" "CalibrationStatus" NOT NULL DEFAULT 'NOT_RUN',
  "calibrationResult" JSONB,
  "backtestResult" JSONB,
  "notes" TEXT,
  "frozenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "prediction_config_versions_sourceSeasonId_createdAt_idx"
ON "prediction_config_versions"("sourceSeasonId", "createdAt");

CREATE TABLE "season_evidence_freezes" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "configVersionId" INTEGER NOT NULL REFERENCES "prediction_config_versions"("id"),
  "version" TEXT NOT NULL,
  "status" "EvidenceFreezeStatus" NOT NULL DEFAULT 'FROZEN',
  "snapshotManifest" JSONB NOT NULL,
  "derivedManifest" JSONB NOT NULL,
  "qualityReport" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "season_evidence_freezes_seasonId_version_key"
ON "season_evidence_freezes"("seasonId", "version");
CREATE INDEX "season_evidence_freezes_configVersionId_idx"
ON "season_evidence_freezes"("configVersionId");

CREATE TABLE "player_season_priors" (
  "id" SERIAL PRIMARY KEY,
  "sourceSeasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "sourceSeasonPlayerId" INTEGER NOT NULL REFERENCES "season_players"("id"),
  "playerId" INTEGER NOT NULL REFERENCES "players"("id"),
  "configVersionId" INTEGER NOT NULL REFERENCES "prediction_config_versions"("id"),
  "targetSeasonCode" TEXT NOT NULL,
  "sourcePosition" "Position" NOT NULL,
  "minutes" INTEGER NOT NULL,
  "appearances" INTEGER NOT NULL,
  "starts" INTEGER,
  "rawXG90" DOUBLE PRECISION,
  "rawXA90" DOUBLE PRECISION,
  "rawTouches90" DOUBLE PRECISION,
  "rawKeyPasses90" DOUBLE PRECISION,
  "rawCarries90" DOUBLE PRECISION,
  "rawDefconActions90" DOUBLE PRECISION,
  "xG90" DOUBLE PRECISION,
  "xA90" DOUBLE PRECISION,
  "touches90" DOUBLE PRECISION,
  "keyPasses90" DOUBLE PRECISION,
  "carries90" DOUBLE PRECISION,
  "defconActions90" DOUBLE PRECISION,
  "sampleWeight" DOUBLE PRECISION NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "confidence" "PriorConfidence" NOT NULL,
  "uncertaintyReasons" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "player_season_priors_sourceSeasonId_playerId_configVersionId_targetSeasonCode_key"
ON "player_season_priors"("sourceSeasonId", "playerId", "configVersionId", "targetSeasonCode");
CREATE INDEX "player_season_priors_targetSeasonCode_confidence_idx"
ON "player_season_priors"("targetSeasonCode", "confidence");
CREATE INDEX "player_season_priors_sourcePosition_idx"
ON "player_season_priors"("sourcePosition");
