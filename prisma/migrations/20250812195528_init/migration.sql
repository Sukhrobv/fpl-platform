-- CreateEnum
CREATE TYPE "public"."Position" AS ENUM ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD');

-- CreateEnum
CREATE TYPE "public"."MappingMethod" AS ENUM ('EXACT_MATCH', 'FUZZY_MATCH', 'MANUAL', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "public"."MappingStatus" AS ENUM ('CONFIRMED', 'PENDING', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "public"."ChipType" AS ENUM ('WILDCARD', 'FREE_HIT', 'BENCH_BOOST', 'TRIPLE_CAPTAIN');

-- CreateTable
CREATE TABLE "public"."teams" (
    "id" SERIAL NOT NULL,
    "fplId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "sofascoreId" INTEGER,
    "understatId" TEXT,
    "stadium" TEXT,
    "founded" INTEGER,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."players" (
    "id" SERIAL NOT NULL,
    "fplId" INTEGER NOT NULL,
    "code" INTEGER NOT NULL,
    "webName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "secondName" TEXT NOT NULL,
    "position" "public"."Position" NOT NULL,
    "teamId" INTEGER NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_mappings" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "method" "public"."MappingMethod" NOT NULL,
    "status" "public"."MappingStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mappedBy" TEXT,
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "player_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."matches" (
    "id" SERIAL NOT NULL,
    "fplId" INTEGER NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "kickoffTime" TIMESTAMP(3) NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "sofascoreId" INTEGER,
    "understatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fpl_player_stats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "goalsConceded" INTEGER NOT NULL DEFAULT 0,
    "ownGoals" INTEGER NOT NULL DEFAULT 0,
    "penaltiesSaved" INTEGER NOT NULL DEFAULT 0,
    "penaltiesMissed" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "bps" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL,
    "influence" DOUBLE PRECISION NOT NULL,
    "creativity" DOUBLE PRECISION NOT NULL,
    "threat" DOUBLE PRECISION NOT NULL,
    "ictIndex" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fpl_player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."external_player_stats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "minutes" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "shots" INTEGER,
    "shotsOnTarget" INTEGER,
    "keyPasses" INTEGER,
    "xG" DOUBLE PRECISION,
    "xA" DOUBLE PRECISION,
    "xGChain" DOUBLE PRECISION,
    "xGBuildup" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "touches" INTEGER,
    "passAccuracy" DOUBLE PRECISION,
    "dribbles" INTEGER,
    "aerialDuels" INTEGER,
    "rawData" JSONB,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "wasHome" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "fplTeamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fantasy_teams" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "teamValue" INTEGER NOT NULL,
    "bank" INTEGER NOT NULL,
    "freeTransfers" INTEGER NOT NULL,
    "pointsHit" INTEGER NOT NULL DEFAULT 0,
    "chipUsed" "public"."ChipType",
    "gameweekPoints" INTEGER,
    "totalPoints" INTEGER,
    "gameweekRank" INTEGER,
    "overallRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fantasy_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fantasy_team_picks" (
    "id" SERIAL NOT NULL,
    "fantasyTeamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fantasy_team_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_logs" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "gameweek" INTEGER,
    "success" BOOLEAN NOT NULL,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."app_config" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_fplId_key" ON "public"."teams"("fplId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_sofascoreId_key" ON "public"."teams"("sofascoreId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_understatId_key" ON "public"."teams"("understatId");

-- CreateIndex
CREATE INDEX "teams_fplId_idx" ON "public"."teams"("fplId");

-- CreateIndex
CREATE INDEX "teams_sofascoreId_idx" ON "public"."teams"("sofascoreId");

-- CreateIndex
CREATE UNIQUE INDEX "players_fplId_key" ON "public"."players"("fplId");

-- CreateIndex
CREATE UNIQUE INDEX "players_code_key" ON "public"."players"("code");

-- CreateIndex
CREATE INDEX "players_fplId_idx" ON "public"."players"("fplId");

-- CreateIndex
CREATE INDEX "players_teamId_idx" ON "public"."players"("teamId");

-- CreateIndex
CREATE INDEX "players_position_idx" ON "public"."players"("position");

-- CreateIndex
CREATE INDEX "player_mappings_source_externalId_idx" ON "public"."player_mappings"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "player_mappings_playerId_source_key" ON "public"."player_mappings"("playerId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "matches_fplId_key" ON "public"."matches"("fplId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_sofascoreId_key" ON "public"."matches"("sofascoreId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_understatId_key" ON "public"."matches"("understatId");

-- CreateIndex
CREATE INDEX "matches_gameweek_idx" ON "public"."matches"("gameweek");

-- CreateIndex
CREATE INDEX "matches_kickoffTime_idx" ON "public"."matches"("kickoffTime");

-- CreateIndex
CREATE INDEX "fpl_player_stats_gameweek_idx" ON "public"."fpl_player_stats"("gameweek");

-- CreateIndex
CREATE UNIQUE INDEX "fpl_player_stats_playerId_matchId_key" ON "public"."fpl_player_stats"("playerId", "matchId");

-- CreateIndex
CREATE INDEX "external_player_stats_gameweek_idx" ON "public"."external_player_stats"("gameweek");

-- CreateIndex
CREATE INDEX "external_player_stats_source_idx" ON "public"."external_player_stats"("source");

-- CreateIndex
CREATE UNIQUE INDEX "external_player_stats_playerId_gameweek_source_key" ON "public"."external_player_stats"("playerId", "gameweek", "source");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_fplTeamId_key" ON "public"."users"("fplTeamId");

-- CreateIndex
CREATE INDEX "fantasy_teams_gameweek_idx" ON "public"."fantasy_teams"("gameweek");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_teams_userId_gameweek_key" ON "public"."fantasy_teams"("userId", "gameweek");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_team_picks_fantasyTeamId_position_key" ON "public"."fantasy_team_picks"("fantasyTeamId", "position");

-- CreateIndex
CREATE INDEX "sync_logs_source_syncType_idx" ON "public"."sync_logs"("source", "syncType");

-- CreateIndex
CREATE INDEX "sync_logs_startedAt_idx" ON "public"."sync_logs"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_config_key_key" ON "public"."app_config"("key");

-- AddForeignKey
ALTER TABLE "public"."players" ADD CONSTRAINT "players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_mappings" ADD CONSTRAINT "player_mappings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "public"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fpl_player_stats" ADD CONSTRAINT "fpl_player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fpl_player_stats" ADD CONSTRAINT "fpl_player_stats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."external_player_stats" ADD CONSTRAINT "external_player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fantasy_teams" ADD CONSTRAINT "fantasy_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "public"."fantasy_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
