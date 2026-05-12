ALTER TABLE crm.ad_platform_connections
  DROP CONSTRAINT IF EXISTS ad_platform_connections_status_check;

ALTER TABLE crm.ad_platform_connections
  ADD CONSTRAINT ad_platform_connections_status_check
  CHECK (status = ANY (ARRAY['active','expired','revoked','error','disconnected']));