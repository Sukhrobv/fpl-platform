-- Remove records from the retired advanced-data source.
DELETE FROM "player_mappings"
WHERE LOWER("source") = 'fbref';

DELETE FROM "external_player_stats"
WHERE LOWER("source") = 'fbref';

DELETE FROM "external_team_stats"
WHERE LOWER("source") = 'fbref';

DELETE FROM "sync_logs"
WHERE LOWER("source") = 'fbref';

-- A retired sync script wrote its defensive fields into Understat rows.
-- Understat does not provide these fields, so null them to prevent provenance mixing.
UPDATE "external_player_stats"
SET
  "clearances" = NULL,
  "blocks" = NULL,
  "interceptions" = NULL,
  "tackles" = NULL,
  "recoveries" = NULL
WHERE LOWER("source") = 'understat';
