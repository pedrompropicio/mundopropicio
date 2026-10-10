-- emails_presos_pending: só conta pendentes SEM linha 'sent' com o mesmo message_id.
-- Reescreve apenas esse bloco de _run_invariant_checks_extra (resto da função intacto).
DO $mig$
DECLARE v_def text; v_old text := 'WHERE l.status = ''pending''';
        v_new text := 'WHERE l.status = ''pending'' AND NOT EXISTS (SELECT 1 FROM public.email_send_log s WHERE s.message_id = l.message_id AND s.status = ''sent'')';
        v_n int;
BEGIN
  v_def := pg_get_functiondef('public._run_invariant_checks_extra'::regproc);
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 ocorrência do filtro pending em _run_invariant_checks_extra, encontrei %', v_n;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $mig$;

UPDATE public.system_invariants
   SET reference_count = 7,
       notes = 'Desde 10/10/2026 conta só linhas pending com mais de 24h SEM linha sent com o mesmo message_id (o worker gravava pending ao enfileirar e outra linha sent ao enviar; 325 eram pares, não presos). Referência 7 = os pendentes reais de 10/10 (2 bilheteira-sync-digest, 5 resend_reset); deve descer para 0 quando forem tratados.'
 WHERE name = 'emails_presos_pending';