CREATE TABLE "external_player_match_stats" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceMatchId" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "opponentTeamId" INTEGER,
    "wasHome" BOOLEAN NOT NULL,
    "minutes" INTEGER NOT NULL,
    "xG" DOUBLE PRECISION NOT NULL,
    "xA" DOUBLE PRECISION NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_player_match_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_player_match_stats_playerId_source_sourceMatchId_key"
ON "external_player_match_stats"("playerId", "source", "sourceMatchId");

CREATE INDEX "external_player_match_stats_seasonId_playerId_opponentTeamId_idx"
ON "external_player_match_stats"("seasonId", "playerId", "opponentTeamId");

CREATE INDEX "external_player_match_stats_source_matchDate_idx"
ON "external_player_match_stats"("source", "matchDate");

ALTER TABLE "external_player_match_stats"
ADD CONSTRAINT "external_player_match_stats_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_player_match_stats"
ADD CONSTRAINT "external_player_match_stats_seasonId_fkey"
FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
