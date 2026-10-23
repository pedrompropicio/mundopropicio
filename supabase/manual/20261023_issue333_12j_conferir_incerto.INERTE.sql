-- #333 12j CONFERIR pedido incerto (cancelled_after_post de 2026-10-23 02:11:04Z). INERTE.
-- Só com revisão do controller + "Sim" próprio do Pedro. NÃO reabre a janela, NÃO repete o pedido,
-- NÃO toca executor, revisão, âmbito, registos financeiros nem outras frentes (#322/#323).
-- Usa APENAS o mecanismo responsável já instalado: data_entry_analysis_responsible_333('confer', ...)
-- (postgres-only; grava auditoria admin_action='confer' + review_sha256). Resultado: closed/idle/sem claim.
--
-- Prova (só leitura, 23/10/2026 ~02:17Z; detalhe em docs/testes/issue333/fase12j-anexos-leitura-unica.md):
--   controlo rev 80: state=unavailable, stage=uncertain, reason=cancelled_after_post, status=NULL,
--     claim=f2a6673b-2b81-477c-9058-b79c23a96f8f, enabled=false; executor=false; review=false; âmbito ativo=0.
--   auditoria: rev 78 claimed 02:11:03.172 → rev 79 post_started 02:11:03.845 → rev 80 uncertain 02:11:04.517.
--   gateway (run 01a16686-19dc-…): 6 pedidos HTTP 200 (02:10:28–02:11:01), nenhum registo para o 7.º POST.
--   Conferir = aceitar que o 7.º pedido PODE ter sido cobrado; nunca é repetido.
-- review_sha256 = sha256 do relatório no commit desta entrega (1a10801cb17e105f53f0cd378a1938d301ef903961a53e89b8e27755db974c83); o controller confirma-o antes de aplicar.
-- Readback ANTES (registar no relatório):
--   SELECT revision, state, stage, active_claim, reason_code, upstream_status, enabled, reviewed FROM public.data_entry_analysis_control_333;
DO $c$
DECLARE
  v_rev constant bigint := 80;
  v_claim constant uuid := 'f2a6673b-2b81-477c-9058-b79c23a96f8f';
  v_review_sha constant text := '1a10801cb17e105f53f0cd378a1938d301ef903961a53e89b8e27755db974c83';
  v_exec boolean; v_review boolean; c record; r jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF v_review_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '#333-12j: sha_por_preencher'; END IF;
  -- Ordem fixa de locks (igual à janela): executor → revisão → controlo → âmbito.
  SELECT enabled INTO v_exec FROM public.data_entry_assistant_executor_settings_333 WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_review FROM public.data_entry_assistant_review_settings_333 WHERE singleton FOR UPDATE;
  SELECT revision, state, stage, active_claim, reason_code, upstream_status, enabled INTO c FROM public.data_entry_analysis_control_333 WHERE singleton FOR UPDATE;
  LOCK TABLE public.data_entry_assistant_scope_333 IN SHARE ROW EXCLUSIVE MODE;
  IF v_exec IS DISTINCT FROM false THEN RAISE EXCEPTION '#333-12j: executor_nao_fechado'; END IF;
  IF v_review IS DISTINCT FROM false THEN RAISE EXCEPTION '#333-12j: revisao_nao_fechada'; END IF;
  IF EXISTS (SELECT 1 FROM public.data_entry_assistant_scope_333 WHERE expires_at > clock_timestamp()) THEN RAISE EXCEPTION '#333-12j: ambito_ativo'; END IF;
  IF c.revision IS DISTINCT FROM v_rev OR c.active_claim IS DISTINCT FROM v_claim OR c.state IS DISTINCT FROM 'unavailable'
     OR c.stage IS DISTINCT FROM 'uncertain' OR c.reason_code IS DISTINCT FROM 'cancelled_after_post' OR c.upstream_status IS NOT NULL
     OR c.enabled IS DISTINCT FROM false
  THEN RAISE EXCEPTION '#333-12j: controlo_diferente_da_prova (rev %, stage %, reason %)', c.revision, c.stage, c.reason_code; END IF;
  r := public.data_entry_analysis_responsible_333('confer', v_rev, v_claim, v_review_sha);
  IF r->>'state' IS DISTINCT FROM 'closed' OR r->>'stage' IS DISTINCT FROM 'idle' OR r->>'claim' IS NOT NULL THEN RAISE EXCEPTION '#333-12j: conferencia_inesperada %', r; END IF;
  RAISE NOTICE '#333-12j conferido: %', r;
END $c$;
-- Readback DEPOIS (esperado: closed/idle/sem claim, enabled=false, reviewed=false; executor=false; review=false; âmbito ativo=0):
SELECT revision, state, stage, active_claim, reason_code, enabled, reviewed,
 (SELECT enabled FROM public.data_entry_assistant_executor_settings_333) executor,
 (SELECT enabled FROM public.data_entry_assistant_review_settings_333) review,
 (SELECT count(*) FROM public.data_entry_assistant_scope_333 WHERE expires_at > now()) ambito_ativo
FROM public.data_entry_analysis_control_333;
SELECT revision, claim, stage, reason_code, admin_action, review_sha256 FROM public.data_entry_analysis_audit_333 WHERE revision >= 80 ORDER BY revision;
