-- #333 12j FECHAR janela (ou revogar antes do prazo). Idempotente; não toca executor nem registos financeiros.
SET LOCAL lock_timeout='5s';
UPDATE public.data_entry_assistant_scope_333 SET expires_at = least(expires_at, clock_timestamp())
 WHERE owner_id='d8e502f7-9ceb-4dae-bd73-7291832d0d6f' AND company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
UPDATE public.data_entry_assistant_review_settings_333 SET enabled=false, changed_at=clock_timestamp() WHERE singleton AND enabled;
UPDATE public.data_entry_analysis_control_333 SET enabled=false, reviewed=false, state='closed', revision=revision+1, reason_code='closed', upstream_status=NULL, changed_at=clock_timestamp() WHERE singleton AND active_claim IS NULL;
SELECT (SELECT count(*) FROM public.data_entry_assistant_scope_333 WHERE expires_at > now()) scope_aberto,
 (SELECT enabled FROM public.data_entry_assistant_review_settings_333) review,
 (SELECT enabled FROM public.data_entry_assistant_executor_settings_333) executor,
 (SELECT state||'/'||stage||'/'||coalesce(active_claim::text,'-') FROM public.data_entry_analysis_control_333) control;
