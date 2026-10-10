-- #296: conciliated_by mantém o valor que o ecrã gravava (email do utilizador), vindo no payload.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text)'::regprocedure);
  IF position('conciliated_by = coalesce(p_audit_user, ''system'')' in d) = 0 THEN
    RAISE EXCEPTION 'trecho não encontrado';
  END IF;
  d := replace(d, 'conciliated_by = coalesce(p_audit_user, ''system'')', 'conciliated_by = coalesce(nullif(p_payload->>''conciliated_by'',''''), ''system'')');
  EXECUTE d;
END $$;