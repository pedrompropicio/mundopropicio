SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION crm.decrypt_token(p_ciphertext text, p_master_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
BEGIN
  RETURN extensions.pgp_sym_decrypt(decode(p_ciphertext, 'base64'), p_master_key);
END;
$function$;

REVOKE EXECUTE ON FUNCTION crm.decrypt_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION crm.decrypt_token(text, text) TO service_role, postgres;
