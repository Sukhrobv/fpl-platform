-- FPL element, team and fixture IDs are only stable inside one season.
-- Season-scoped unique indexes created by the previous migration remain authoritative.
DROP INDEX IF EXISTS "teams_fplId_key";
DROP INDEX IF EXISTS "players_fplId_key";
DROP INDEX IF EXISTS "matches_fplId_key";
DROP INDEX IF EXISTS "fpl_player_stats_playerId_matchId_key";
DROP INDEX IF EXISTS "external_player_stats_playerId_gameweek_source_key";
DROP INDEX IF EXISTS "external_team_stats_teamId_matchDate_source_key";
DROP INDEX IF EXISTS "fantasy_teams_userId_gameweek_key";
