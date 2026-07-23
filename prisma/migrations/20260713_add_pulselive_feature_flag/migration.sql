INSERT INTO "app_config" ("key", "value", "description", "createdAt", "updatedAt")
VALUES (
  'pulselive_enrichment_enabled',
  'false',
  'Fail-closed publication gate for mapped PulseLive enrichment in user-facing predictions',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
