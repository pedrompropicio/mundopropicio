-- #333 12j ABRIR janela conversa+leitura/revisão (30 min). Só com Pedro no preview. Executor SQL NÃO é tocado.
SET LOCAL lock_timeout='5s';
DO $w$
BEGIN
  IF (SELECT enabled FROM public.data_entry_assistant_executor_settings_333 WHERE singleton) IS DISTINCT FROM false
     OR EXISTS (SELECT 1 FROM public.data_entry_assistant_scope_333)
     OR (SELECT state FROM public.data_entry_analysis_control_333 WHERE singleton) IS DISTINCT FROM 'closed'
     OR (SELECT stage FROM public.data_entry_analysis_control_333 WHERE singleton) IS DISTINCT FROM 'idle'
  THEN RAISE EXCEPTION '#333-12j: estado_inesperado'; END IF;
  INSERT INTO public.data_entry_assistant_scope_333(owner_id, company_id, expires_at)
  VALUES ('d8e502f7-9ceb-4dae-bd73-7291832d0d6f', '7c858982-6ccd-47ca-bd65-e0dd3eebf01c', clock_timestamp() + interval '30 minutes');
  UPDATE public.data_entry_assistant_review_settings_333 SET enabled = true, changed_at = clock_timestamp() WHERE singleton;
  UPDATE public.data_entry_analysis_control_333 SET state='ready', enabled=true, reviewed=true, revision=revision+1, reason_code='ready', upstream_status=NULL, changed_at=clock_timestamp() WHERE singleton;
END $w$;
SELECT expires_at FROM public.data_entry_assistant_scope_333;
