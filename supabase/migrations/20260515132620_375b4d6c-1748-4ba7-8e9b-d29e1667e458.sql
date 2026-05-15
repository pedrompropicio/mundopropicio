
CREATE OR REPLACE FUNCTION public.create_vault_secret(_name text, _value text, _description text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := vault.create_secret(_value, _name, _description);
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_vault_secret(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vault_secret(text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_vault_secret(text, text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.update_vault_secret(_id uuid, _value text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  PERFORM vault.update_secret(_id, _value);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.update_vault_secret(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_vault_secret(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_vault_secret(uuid, text) FROM anon;

CREATE OR REPLACE FUNCTION public.get_vault_secret(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = _name LIMIT 1;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM anon;
