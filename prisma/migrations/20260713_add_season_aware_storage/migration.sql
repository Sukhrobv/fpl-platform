CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETE');

CREATE TABLE "seasons" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "startYear" INTEGER NOT NULL,
  "endYear" INTEGER NOT NULL,
  "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',
  "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "seasons_single_current_idx"
ON "seasons" (("isCurrent"))
WHERE "isCurrent" = TRUE;
CREATE INDEX "seasons_status_idx" ON "seasons"("status");

INSERT INTO "seasons" (
  "code", "startYear", "endYear", "status", "isCurrent", "startedAt", "endedAt", "updatedAt"
) VALUES (
  '2025/26', 2025, 2026, 'COMPLETE', TRUE,
  '2025-08-01T00:00:00.000Z', '2026-05-31T23:59:59.999Z', CURRENT_TIMESTAMP
);

CREATE TABLE "season_teams" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "teamId" INTEGER NOT NULL REFERENCES "teams"("id"),
  "fplId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "season_teams_seasonId_fplId_key" ON "season_teams"("seasonId", "fplId");
CREATE UNIQUE INDEX "season_teams_seasonId_teamId_key" ON "season_teams"("seasonId", "teamId");
CREATE INDEX "season_teams_seasonId_active_idx" ON "season_teams"("seasonId", "active");

INSERT INTO "season_teams" (
  "seasonId", "teamId", "fplId", "name", "shortName", "active", "createdAt", "updatedAt"
)
SELECT s."id", t."id", t."fplId", t."name", t."shortName", TRUE, t."createdAt", CURRENT_TIMESTAMP
FROM "teams" t
CROSS JOIN "seasons" s
WHERE s."code" = '2025/26';

CREATE TABLE "season_players" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL REFERENCES "seasons"("id"),
  "playerId" INTEGER NOT NULL REFERENCES "players"("id"),
  "seasonTeamId" INTEGER NOT NULL REFERENCES "season_teams"("id"),
  "fplId" INTEGER NOT NULL,
  "position" "Position" NOT NULL,
  "squadNumber" INTEGER,
  "nowCost" INTEGER NOT NULL,
  "selectedBy" DOUBLE PRECISION NOT NULL,
  "totalPoints" INTEGER NOT NULL,
  "pointsPerGame" DOUBLE PRECISION NOT NULL,
  "form" DOUBLE PRECISION NOT NULL,
  "status" TEXT,
  "news" TEXT,
  "newsAdded" TIMESTAMP(3),
  "chanceOfPlaying" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "season_players_seasonId_fplId_key" ON "season_players"("seasonId", "fplId");
CREATE UNIQUE INDEX "season_players_seasonId_playerId_key" ON "season_players"("seasonId", "playerId");
CREATE INDEX "season_players_seasonTeamId_idx" ON "season_players"("seasonTeamId");
CREATE INDEX "season_players_seasonId_active_idx" ON "season_players"("seasonId", "active");

INSERT INTO "season_players" (
  "seasonId", "playerId", "seasonTeamId", "fplId", "position", "squadNumber",
  "nowCost", "selectedBy", "totalPoints", "pointsPerGame", "form", "status", "news",
  "newsAdded", "chanceOfPlaying", "active", "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt"
)
SELECT
  s."id", p."id", st."id", p."fplId", p."position", p."squadNumber",
  p."nowCost", p."selectedBy", p."totalPoints", p."pointsPerGame", p."form", p."status", p."news",
  p."newsAdded", p."chanceOfPlaying", p."active", p."firstSeenAt", p."lastSeenAt", p."createdAt", CURRENT_TIMESTAMP
FROM "players" p
JOIN "season_teams" st ON st."teamId" = p."teamId"
JOIN "seasons" s ON s."id" = st."seasonId" AND s."code" = '2025/26';

CREATE TABLE "season_player_mappings" (
  "id" SERIAL PRIMARY KEY,
  "seasonPlayerId" INTEGER NOT NULL REFERENCES "season_players"("id"),
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "method" "MappingMethod" NOT NULL,
  "status" "MappingStatus" NOT NULL DEFAULT 'PENDING',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mappedBy" TEXT,
  "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "notes" TEXT
);
CREATE UNIQUE INDEX "season_player_mappings_seasonPlayerId_source_key"
ON "season_player_mappings"("seasonPlayerId", "source");
CREATE INDEX "season_player_mappings_source_externalId_idx"
ON "season_player_mappings"("source", "externalId");

INSERT INTO "season_player_mappings" (
  "seasonPlayerId", "source", "externalId", "method", "status", "confidence",
  "mappedBy", "mappedAt", "verifiedAt", "notes"
)
SELECT
  sp."id", pm."source", pm."externalId", pm."method", pm."status", pm."confidence",
  pm."mappedBy", pm."mappedAt", pm."verifiedAt", pm."notes"
FROM "player_mappings" pm
JOIN "season_players" sp ON sp."playerId" = pm."playerId"
JOIN "seasons" s ON s."id" = sp."seasonId" AND s."code" = '2025/26';

ALTER TABLE "matches"
ADD COLUMN "seasonId" INTEGER,
ADD COLUMN "homeSeasonTeamId" INTEGER,
ADD COLUMN "awaySeasonTeamId" INTEGER;

UPDATE "matches" m
SET "seasonId" = s."id",
    "homeSeasonTeamId" = home_st."id",
    "awaySeasonTeamId" = away_st."id"
FROM "seasons" s,
     "season_teams" home_st,
     "season_teams" away_st
WHERE s."code" = '2025/26'
  AND home_st."seasonId" = s."id" AND home_st."teamId" = m."homeTeamId"
  AND away_st."seasonId" = s."id" AND away_st."teamId" = m."awayTeamId";

ALTER TABLE "matches"
ALTER COLUMN "seasonId" SET NOT NULL,
ALTER COLUMN "homeSeasonTeamId" SET NOT NULL,
ALTER COLUMN "awaySeasonTeamId" SET NOT NULL,
ADD CONSTRAINT "matches_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id"),
ADD CONSTRAINT "matches_homeSeasonTeamId_fkey" FOREIGN KEY ("homeSeasonTeamId") REFERENCES "season_teams"("id"),
ADD CONSTRAINT "matches_awaySeasonTeamId_fkey" FOREIGN KEY ("awaySeasonTeamId") REFERENCES "season_teams"("id");
CREATE UNIQUE INDEX "matches_seasonId_fplId_key" ON "matches"("seasonId", "fplId");
CREATE INDEX "matches_seasonId_gameweek_idx" ON "matches"("seasonId", "gameweek");

ALTER TABLE "fpl_player_stats"
ADD COLUMN "seasonId" INTEGER,
ADD COLUMN "seasonPlayerId" INTEGER;
UPDATE "fpl_player_stats" fps
SET "seasonId" = sp."seasonId", "seasonPlayerId" = sp."id"
FROM "season_players" sp
WHERE sp."playerId" = fps."playerId";
ALTER TABLE "fpl_player_stats"
ALTER COLUMN "seasonId" SET NOT NULL,
ALTER COLUMN "seasonPlayerId" SET NOT NULL,
ADD CONSTRAINT "fpl_player_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id"),
ADD CONSTRAINT "fpl_player_stats_seasonPlayerId_fkey" FOREIGN KEY ("seasonPlayerId") REFERENCES "season_players"("id");
CREATE UNIQUE INDEX "fpl_player_stats_seasonPlayerId_matchId_key"
ON "fpl_player_stats"("seasonPlayerId", "matchId");
CREATE INDEX "fpl_player_stats_seasonId_gameweek_idx" ON "fpl_player_stats"("seasonId", "gameweek");

ALTER TABLE "external_player_stats"
ADD COLUMN "seasonId" INTEGER,
ADD COLUMN "seasonPlayerId" INTEGER;
UPDATE "external_player_stats" eps
SET "seasonId" = sp."seasonId", "seasonPlayerId" = sp."id"
FROM "season_players" sp
WHERE sp."playerId" = eps."playerId";
ALTER TABLE "external_player_stats"
ALTER COLUMN "seasonId" SET NOT NULL,
ALTER COLUMN "seasonPlayerId" SET NOT NULL,
ADD CONSTRAINT "external_player_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id"),
ADD CONSTRAINT "external_player_stats_seasonPlayerId_fkey" FOREIGN KEY ("seasonPlayerId") REFERENCES "season_players"("id");
CREATE UNIQUE INDEX "external_player_stats_seasonPlayerId_gameweek_source_key"
ON "external_player_stats"("seasonPlayerId", "gameweek", "source");
CREATE INDEX "external_player_stats_seasonId_gameweek_idx"
ON "external_player_stats"("seasonId", "gameweek");

ALTER TABLE "external_team_stats"
ADD COLUMN "seasonId" INTEGER,
ADD COLUMN "seasonTeamId" INTEGER;
UPDATE "external_team_stats" ets
SET "seasonId" = st."seasonId", "seasonTeamId" = st."id"
FROM "season_teams" st
WHERE st."teamId" = ets."teamId";
ALTER TABLE "external_team_stats"
ALTER COLUMN "seasonId" SET NOT NULL,
ALTER COLUMN "seasonTeamId" SET NOT NULL,
ADD CONSTRAINT "external_team_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id"),
ADD CONSTRAINT "external_team_stats_seasonTeamId_fkey" FOREIGN KEY ("seasonTeamId") REFERENCES "season_teams"("id");
CREATE UNIQUE INDEX "external_team_stats_seasonTeamId_matchDate_source_key"
ON "external_team_stats"("seasonTeamId", "matchDate", "source");
CREATE INDEX "external_team_stats_seasonId_idx" ON "external_team_stats"("seasonId");

ALTER TABLE "fantasy_teams" ADD COLUMN "seasonId" INTEGER;
UPDATE "fantasy_teams"
SET "seasonId" = (SELECT "id" FROM "seasons" WHERE "code" = '2025/26');
ALTER TABLE "fantasy_teams"
ALTER COLUMN "seasonId" SET NOT NULL,
ADD CONSTRAINT "fantasy_teams_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id");
CREATE UNIQUE INDEX "fantasy_teams_userId_seasonId_gameweek_key"
ON "fantasy_teams"("userId", "seasonId", "gameweek");
CREATE INDEX "fantasy_teams_seasonId_gameweek_idx" ON "fantasy_teams"("seasonId", "gameweek");

ALTER TABLE "sync_logs" ADD COLUMN "seasonId" INTEGER;
UPDATE "sync_logs"
SET "seasonId" = (SELECT "id" FROM "seasons" WHERE "code" = '2025/26');
ALTER TABLE "sync_logs"
ADD CONSTRAINT "sync_logs_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id");
CREATE INDEX "sync_logs_seasonId_startedAt_idx" ON "sync_logs"("seasonId", "startedAt");

ALTER TABLE "source_snapshots" ADD COLUMN "seasonId" INTEGER;
UPDATE "source_snapshots" ss
SET "seasonId" = s."id"
FROM "seasons" s
WHERE ss."season" = s."code";
ALTER TABLE "source_snapshots"
ADD CONSTRAINT "source_snapshots_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id");
CREATE INDEX "source_snapshots_seasonId_source_dataset_idx"
ON "source_snapshots"("seasonId", "source", "dataset");

DO $$
DECLARE
  season_id INTEGER;
BEGIN
  SELECT "id" INTO season_id FROM "seasons" WHERE "code" = '2025/26';
  IF (SELECT COUNT(*) FROM "season_teams" WHERE "seasonId" = season_id) <> (SELECT COUNT(*) FROM "teams") THEN
    RAISE EXCEPTION 'Season-team backfill count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM "season_players" WHERE "seasonId" = season_id) <> (SELECT COUNT(*) FROM "players") THEN
    RAISE EXCEPTION 'Season-player backfill count mismatch';
  END IF;
  IF (SELECT COUNT(*) FROM "matches" WHERE "seasonId" = season_id) <> (SELECT COUNT(*) FROM "matches") THEN
    RAISE EXCEPTION 'Match season backfill count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM "fpl_player_stats" WHERE "seasonId" IS NULL OR "seasonPlayerId" IS NULL) THEN
    RAISE EXCEPTION 'FPL stats contain unscoped rows';
  END IF;
  IF EXISTS (SELECT 1 FROM "external_player_stats" WHERE "seasonId" IS NULL OR "seasonPlayerId" IS NULL) THEN
    RAISE EXCEPTION 'External player stats contain unscoped rows';
  END IF;
  IF EXISTS (SELECT 1 FROM "external_team_stats" WHERE "seasonId" IS NULL OR "seasonTeamId" IS NULL) THEN
    RAISE EXCEPTION 'External team stats contain unscoped rows';
  END IF;
END $$;
