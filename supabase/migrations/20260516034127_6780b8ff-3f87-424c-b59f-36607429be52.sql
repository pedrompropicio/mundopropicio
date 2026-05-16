CREATE OR REPLACE FUNCTION public.upsert_vault_secret(
  _name text, _value text, _description text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = _name LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_id, _value, NULL, _description);
  ELSE
    v_id := vault.create_secret(_value, _name, COALESCE(_description, ''));
  END IF;
  RETURN v_id;
END $function$;

ALTER TABLE public.fever_sync_config
  ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz;