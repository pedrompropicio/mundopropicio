ALTER TABLE coala_sync_config
ADD COLUMN IF NOT EXISTS last_modified_time TIMESTAMPTZ;

COMMENT ON COLUMN coala_sync_config.last_modified_time IS
'Drive modifiedTime do XLSX da última sync com sucesso. Usado para saltar downloads desnecessários.';