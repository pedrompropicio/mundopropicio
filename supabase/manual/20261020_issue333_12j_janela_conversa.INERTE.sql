-- #333 12j ABRIR/RETOMAR janela conversa+leitura/revisão (30 min). INERTE: só com Pedro presente e Sim próprio.
-- Executor SQL NÃO é tocado. Bloco único (DO) = uma transação; qualquer falha não deixa nada aplicado.
-- Correção 22/10/2026 (versão anterior sha256 e3aad296…2b4d):
--  * reason_code='ready' não existe na CHECK de data_entry_analysis_control_333; abrir usa 'none' (contrato atual).
--  * lock_timeout aplicado dentro da transação (SET LOCAL fora de transação não tinha efeito).
--  * Retoma nominal: se já existir a linha de âmbito EXPIRADA do mesmo owner+empresa, é reutilizada (sem DELETE).
--    A CHECK da tabela exige expires_at <= created_at + 2h, por isso created_at passa ao instante da retoma;
--    os valores anteriores saem em NOTICE e devem ser copiados para o relatório antes/depois (readback abaixo).
--  * Recusa: executor≠false, revisão≠false, controlo não fechado/idle/sem claim, âmbito ainda ativo,
--    ou qualquer linha de âmbito de outro owner/empresa.
-- Readback antes de aplicar (registar no relatório):
--   SELECT owner_id, company_id, created_at, expires_at, expires_at > now() AS aberto FROM public.data_entry_assistant_scope_333;
DO $w$
DECLARE
  v_owner constant uuid := 'd8e502f7-9ceb-4dae-bd73-7291832d0d6f';
  v_company constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  v_now timestamptz;
  v_exec boolean; v_review boolean;
  c record; prev record;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Ordem fixa de locks: executor → revisão → controlo → âmbito.
  SELECT enabled INTO v_exec FROM public.data_entry_assistant_executor_settings_333 WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_review FROM public.data_entry_assistant_review_settings_333 WHERE singleton FOR UPDATE;
  SELECT state, stage, active_claim, enabled, reviewed INTO c FROM public.data_entry_analysis_control_333 WHERE singleton FOR UPDATE;
  LOCK TABLE public.data_entry_assistant_scope_333 IN SHARE ROW EXCLUSIVE MODE;
  IF v_exec IS DISTINCT FROM false THEN RAISE EXCEPTION '#333-12j: executor_nao_fechado'; END IF;
  IF v_review IS DISTINCT FROM false THEN RAISE EXCEPTION '#333-12j: revisao_nao_fechada'; END IF;
  IF c.state IS DISTINCT FROM 'closed' OR c.stage IS DISTINCT FROM 'idle' OR c.active_claim IS NOT NULL
     OR c.enabled IS DISTINCT FROM false OR c.reviewed IS DISTINCT FROM false
  THEN RAISE EXCEPTION '#333-12j: controlo_nao_fechado'; END IF;
  IF EXISTS (SELECT 1 FROM public.data_entry_assistant_scope_333 WHERE owner_id <> v_owner OR company_id <> v_company)
  THEN RAISE EXCEPTION '#333-12j: ambito_inesperado'; END IF;
  v_now := clock_timestamp();
  SELECT created_at, expires_at INTO prev FROM public.data_entry_assistant_scope_333
   WHERE owner_id = v_owner AND company_id = v_company FOR UPDATE;
  IF FOUND THEN
    IF prev.expires_at > v_now THEN RAISE EXCEPTION '#333-12j: ambito_ainda_ativo'; END IF;
    RAISE NOTICE '#333-12j retoma: anterior created_at=% expires_at=%', prev.created_at, prev.expires_at;
    UPDATE public.data_entry_assistant_scope_333 SET created_at = v_now, expires_at = v_now + interval '30 minutes'
     WHERE owner_id = v_owner AND company_id = v_company;
  ELSE
    INSERT INTO public.data_entry_assistant_scope_333(owner_id, company_id, created_at, expires_at)
    VALUES (v_owner, v_company, v_now, v_now + interval '30 minutes');
  END IF;
  UPDATE public.data_entry_assistant_review_settings_333 SET enabled = true, changed_at = v_now WHERE singleton;
  UPDATE public.data_entry_analysis_control_333 SET state = 'ready', enabled = true, reviewed = true, revision = revision + 1,
    reason_code = 'none', upstream_status = NULL, changed_at = v_now WHERE singleton;
END $w$;
SELECT owner_id, company_id, created_at, expires_at FROM public.data_entry_assistant_scope_333;
