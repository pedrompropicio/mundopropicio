-- 0307 — Issue #415 E2b: contrato do fechamento e suporte individual de overhead.
-- Data: 03/11/2026. Autorização de preparação: 6609062218 (Pedro).
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Sem BEGIN/COMMIT; sem DML/backfill de configurações históricas.
-- Inicialização explícita, linha a linha por manifesto aprovado; nunca copiar os cards.
-- Fontes versionadas 0269/0270/0275; catálogo instalado/locks legados a verificar antes de promover.
-- Rollback: supabase/manual/rollback_0307_issue415_settlement_contract_comentado.sql

ALTER TABLE public.event_settlements
  ADD COLUMN contract_expense_source text NULL CHECK (contract_expense_source IN ('realized','committed')),
  ADD COLUMN contract_include_overhead boolean NULL,
  ADD COLUMN contract_revision integer NOT NULL DEFAULT 0 CHECK (contract_revision >= 0),
  ADD COLUMN contract_initialized_at timestamptz NULL,
  ADD COLUMN contract_initialized_by uuid NULL,
  ADD CONSTRAINT issue415_contract_initialization CHECK (
    (contract_initialized_at IS NULL AND contract_initialized_by IS NULL
      AND contract_expense_source IS NULL AND contract_include_overhead IS NULL AND contract_revision = 0)
    OR (contract_initialized_at IS NOT NULL AND contract_initialized_by IS NOT NULL AND contract_revision > 0
      AND (parent_id IS NOT NULL OR (contract_expense_source IS NOT NULL AND contract_include_overhead IS NOT NULL)))
  );
ALTER TABLE public.event_settlement_participants
  ADD COLUMN supports_overhead boolean NOT NULL DEFAULT true;

-- A auditoria é também o ledger do recibo; unicidade protege a chave além do lock de retry.
CREATE UNIQUE INDEX issue415_contract_request_key ON public.system_audit_log (company_id, (new_data->>'request_key'))
  WHERE action = 'settlement_contract_command' AND new_data->>'request_key' IS NOT NULL;

-- Privado por ACL: só os três comandos públicos chamam este corpo como owner.
-- Um lock por tenant/chave serializa retries, inclusive entre comandos/nós distintos.
CREATE FUNCTION public._issue415_contract_command(
  p_operation text, p_id uuid, p_expense_source text, p_include_overhead boolean,
  p_supports_overhead boolean, p_expected_revision integer, p_reason text, p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_node public.event_settlements;
  v_participant public.event_settlement_participants;
  v_ids uuid[];
  v_root uuid;
  v_payload jsonb;
  v_previous jsonb;
  v_receipt jsonb;
  v_old jsonb;
  v_new jsonb;
  v_old_family jsonb;
  v_new_family jsonb;
  v_flag text := current_setting('app.settlement_contract_op', true);
  v_source text;
  v_overhead boolean;
BEGIN
  -- manage_bp isolado nunca autoriza uma alteração contratual.
  IF v_actor IS NULL OR v_company IS NULL OR NOT COALESCE((
    public.has_role(v_actor,'admin') OR public.has_role(v_actor,'manager')
  ), false) THEN RAISE EXCEPTION 'Sem permissão para alterar contrato'; END IF;
  IF p_operation NOT IN ('initialize','set','participant') OR p_operation IS NULL THEN RAISE EXCEPTION 'Comando inválido'; END IF;
  IF p_request_key IS NULL OR btrim(p_request_key) = '' OR length(p_request_key) > 200 THEN RAISE EXCEPTION 'Chave de pedido obrigatória'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Identificador obrigatório'; END IF;
  IF p_expense_source IS NOT NULL AND p_expense_source NOT IN ('realized','committed') THEN RAISE EXCEPTION 'Fonte inválida'; END IF;
  IF p_operation <> 'initialize' AND (p_expected_revision IS NULL OR p_expected_revision < 0) THEN RAISE EXCEPTION 'Revisão esperada obrigatória'; END IF;
  IF p_operation = 'participant' AND p_supports_overhead IS NULL THEN RAISE EXCEPTION 'Suporte overhead obrigatório'; END IF;
  v_payload := jsonb_build_object('operation',p_operation,'id',p_id,'expense_source',p_expense_source,
    'include_overhead',p_include_overhead,'supports_overhead',p_supports_overhead,
    'expected_revision',p_expected_revision,'reason',p_reason,'actor',v_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || p_request_key, 415));
  SELECT new_data INTO v_previous FROM public.system_audit_log
    WHERE company_id = v_company AND action = 'settlement_contract_command'
      AND new_data->>'request_key' = p_request_key;
  IF FOUND THEN
    IF v_previous->'payload' IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Chave de pedido reutilizada com payload diferente'; END IF;
    RETURN v_previous->'receipt';
  END IF;

  IF p_operation = 'participant' THEN
    SELECT * INTO v_participant FROM public.event_settlement_participants WHERE id = p_id;
    IF NOT FOUND OR v_participant.company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'Participante inexistente ou de outra empresa'; END IF;
    SELECT * INTO v_node FROM public.event_settlements WHERE id = v_participant.settlement_id;
  ELSE
    SELECT * INTO v_node FROM public.event_settlements WHERE id = p_id;
  END IF;
  IF v_node.id IS NULL OR v_node.company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'Fechamento inexistente ou de outra empresa'; END IF;

  -- Inclui ancestral de origem, descendentes e irmãos; UUID crescente em todas as RPCs.
  WITH RECURSIVE ancestors AS (
    SELECT s.id, s.parent_id FROM public.event_settlements s WHERE s.id = v_node.id
    UNION
    SELECT s.id, s.parent_id FROM public.event_settlements s JOIN ancestors a ON s.id = a.parent_id
  ) SELECT id INTO v_root FROM ancestors WHERE parent_id IS NULL;
  IF v_root IS NULL THEN RAISE EXCEPTION 'Árvore inválida'; END IF;
  WITH RECURSIVE family AS (
    SELECT s.id FROM public.event_settlements s WHERE s.id = v_root
    UNION
    SELECT s.id FROM public.event_settlements s JOIN family f ON s.parent_id = f.id
  ) SELECT array_agg(id ORDER BY id) INTO v_ids FROM family;
  PERFORM s.id FROM public.event_settlements s WHERE s.id = ANY(v_ids) ORDER BY s.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.event_settlements s WHERE s.id = ANY(v_ids)
    AND (s.company_id IS DISTINCT FROM v_company OR s.event_id IS DISTINCT FROM v_node.event_id)) THEN RAISE EXCEPTION 'Árvore fora da empresa/evento'; END IF;
  SELECT * INTO v_node FROM public.event_settlements WHERE id = v_node.id;
  IF v_node.id IS NULL THEN RAISE EXCEPTION 'Árvore alterada; repita o pedido'; END IF;
  -- Topologia pode ter mudado enquanto se esperava pelo lock: falhar em vez de alargar sem lock.
  -- Revalidar cada ligação sob os locks já obtidos (sem tomar locks numa segunda ordem).
  IF EXISTS (SELECT 1 FROM public.event_settlements s WHERE s.parent_id = ANY(v_ids) AND NOT s.id = ANY(v_ids))
    OR EXISTS (SELECT 1 FROM public.event_settlements s WHERE s.id = ANY(v_ids) AND s.parent_id IS NOT NULL AND NOT s.parent_id = ANY(v_ids))
    THEN RAISE EXCEPTION 'Árvore alterada; repita o pedido'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_settlements WHERE id = ANY(v_ids) AND is_sealed) THEN RAISE EXCEPTION 'Fechamento selado: reabra primeiro'; END IF;
  -- Participantes são bloqueados depois dos nós e também por UUID.
  PERFORM p.id FROM public.event_settlement_participants p WHERE p.settlement_id = ANY(v_ids) ORDER BY p.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.event_settlement_participants p WHERE p.settlement_id = ANY(v_ids) AND p.frozen_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.partner_payment_contracts c JOIN public.event_settlement_participants p ON p.id = c.participant_id
      WHERE p.settlement_id = ANY(v_ids) AND c.cancelled_at IS NULL) THEN RAISE EXCEPTION 'Sócio congelado ou com contratos ativos'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'source',contract_expense_source,
    'overhead',contract_include_overhead,'revision',contract_revision,'initialized_at',contract_initialized_at) ORDER BY id)
    INTO v_old_family FROM public.event_settlements WHERE id = ANY(v_ids);

  IF p_operation = 'initialize' THEN
    IF v_node.contract_initialized_at IS NOT NULL THEN RAISE EXCEPTION 'Contrato já inicializado'; END IF;
  ELSE
    IF v_node.contract_initialized_at IS NULL THEN RAISE EXCEPTION 'Contrato por configurar'; END IF;
    IF v_node.contract_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Revisão desfasada'; END IF;
  END IF;
  PERFORM set_config('app.settlement_contract_op','on',true);
  IF p_operation = 'participant' THEN
    SELECT * INTO v_participant FROM public.event_settlement_participants WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_participant.settlement_id IS DISTINCT FROM v_node.id
      OR v_participant.company_id IS DISTINCT FROM v_company OR v_participant.event_id IS DISTINCT FROM v_node.event_id
      THEN RAISE EXCEPTION 'Participante alterado ou fora do perímetro'; END IF;
    IF v_participant.mode IS DISTINCT FROM 'settles' OR v_participant.participant_kind IS DISTINCT FROM 'partner'
      THEN RAISE EXCEPTION 'Só participante externo settles pode alterar overhead'; END IF;
    v_old := to_jsonb(v_participant);
    UPDATE public.event_settlement_participants SET supports_overhead = p_supports_overhead WHERE id = p_id;
    UPDATE public.event_settlements SET contract_revision = contract_revision + 1 WHERE id = v_node.id;
  ELSE
    IF v_node.parent_id IS NULL AND (p_expense_source IS NULL OR p_include_overhead IS NULL) THEN RAISE EXCEPTION 'Raiz exige fonte e overhead explícitos'; END IF;
    v_old := to_jsonb(v_node);
    UPDATE public.event_settlements SET contract_expense_source = p_expense_source,
      contract_include_overhead = p_include_overhead, contract_revision = contract_revision + 1,
      contract_initialized_at = COALESCE(contract_initialized_at,now()),
      contract_initialized_by = COALESCE(contract_initialized_by,v_actor) WHERE id = v_node.id;
  END IF;

  -- Q3-A, por campo: herdar só de ancestral inicializado, nunca dos cards.
  WITH RECURSIVE ancestors AS (
    SELECT s.*, 0 depth FROM public.event_settlements s WHERE s.id = v_node.id
    UNION ALL SELECT s.*, a.depth + 1 FROM public.event_settlements s JOIN ancestors a ON s.id = a.parent_id
  ) SELECT contract_expense_source INTO v_source FROM ancestors
    WHERE contract_initialized_at IS NOT NULL AND contract_expense_source IS NOT NULL ORDER BY depth LIMIT 1;
  WITH RECURSIVE ancestors AS (
    SELECT s.*, 0 depth FROM public.event_settlements s WHERE s.id = v_node.id
    UNION ALL SELECT s.*, a.depth + 1 FROM public.event_settlements s JOIN ancestors a ON s.id = a.parent_id
  ) SELECT contract_include_overhead INTO v_overhead FROM ancestors
    WHERE contract_initialized_at IS NOT NULL AND contract_include_overhead IS NOT NULL ORDER BY depth LIMIT 1;
  IF v_source IS NULL OR v_overhead IS NULL THEN RAISE EXCEPTION 'Contrato sem ancestral configurado'; END IF;
  -- Revalidar a regra em todos os dependentes antes de confirmar o comando.
  IF EXISTS (
    WITH RECURSIVE effective AS (
      SELECT s.id,s.contract_include_overhead overhead FROM public.event_settlements s WHERE s.id = ANY(v_ids) AND s.parent_id IS NULL
      UNION ALL SELECT s.id, CASE WHEN s.contract_initialized_at IS NOT NULL AND s.contract_include_overhead IS NOT NULL
        THEN s.contract_include_overhead ELSE e.overhead END FROM public.event_settlements s JOIN effective e ON s.parent_id = e.id
    ) SELECT 1 FROM effective e WHERE e.overhead IS TRUE
      AND EXISTS (SELECT 1 FROM public.event_settlement_participants p WHERE p.settlement_id=e.id AND NOT p.supports_overhead)
      AND (SELECT count(*) FROM public.event_settlement_participants p WHERE p.settlement_id=e.id AND p.mode='settles') < 2
  ) THEN RAISE EXCEPTION 'Dispensa ativa exige pelo menos 2 settles'; END IF;
  PERFORM set_config('app.settlement_contract_op',COALESCE(v_flag,''),true);
  SELECT * INTO v_node FROM public.event_settlements WHERE id = v_node.id;
  IF p_operation = 'participant' THEN
    SELECT to_jsonb(p) INTO v_new FROM public.event_settlement_participants p WHERE id=p_id;
  ELSE v_new := to_jsonb(v_node); END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'source',contract_expense_source,
    'overhead',contract_include_overhead,'revision',contract_revision,'initialized_at',contract_initialized_at) ORDER BY id)
    INTO v_new_family FROM public.event_settlements WHERE id = ANY(v_ids);
  v_receipt := jsonb_build_object('ok',true,'request_key',p_request_key,'settlement_id',v_node.id,
    'participant_id',CASE WHEN p_operation='participant' THEN p_id ELSE NULL END,
    'revision',v_node.contract_revision,'expense_source',v_source,'include_overhead',v_overhead,
    'supports_overhead',p_supports_overhead,'changed_by',v_actor);
  INSERT INTO public.system_audit_log (entity_type,entity_id,action,changed_by,old_data,new_data,company_id)
  VALUES (CASE WHEN p_operation='participant' THEN 'event_settlement_participants' ELSE 'event_settlements' END,
    p_id::text,'settlement_contract_command',v_actor::text,
    jsonb_build_object('values',v_old,'family',v_old_family),
    jsonb_build_object('request_key',p_request_key,'payload',v_payload,'receipt',v_receipt,'values',v_new,
      'family',v_new_family,'event_id',v_node.event_id,'reason',p_reason),v_company);
  RETURN v_receipt;
END $function$;
REVOKE ALL ON FUNCTION public._issue415_contract_command(text,uuid,text,boolean,boolean,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.initialize_settlement_contract(p_settlement_id uuid, p_expense_source text, p_include_overhead boolean, p_reason text, p_request_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public._issue415_contract_command('initialize',p_settlement_id,p_expense_source,p_include_overhead,NULL,NULL,p_reason,p_request_key); $function$;
REVOKE ALL ON FUNCTION public.initialize_settlement_contract(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_settlement_contract(uuid, text, boolean, text, text) TO authenticated, service_role;

CREATE FUNCTION public.set_settlement_contract(p_settlement_id uuid, p_expense_source text, p_include_overhead boolean, p_expected_revision integer, p_reason text, p_request_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public._issue415_contract_command('set',p_settlement_id,p_expense_source,p_include_overhead,NULL,p_expected_revision,p_reason,p_request_key); $function$;
REVOKE ALL ON FUNCTION public.set_settlement_contract(uuid, text, boolean, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_settlement_contract(uuid, text, boolean, integer, text, text) TO authenticated, service_role;

CREATE FUNCTION public.set_settlement_participant_overhead(p_participant_id uuid, p_supports_overhead boolean, p_expected_revision integer, p_reason text, p_request_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public._issue415_contract_command('participant',p_participant_id,NULL,NULL,p_supports_overhead,p_expected_revision,p_reason,p_request_key); $function$;
REVOKE ALL ON FUNCTION public.set_settlement_participant_overhead(uuid, boolean, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_settlement_participant_overhead(uuid, boolean, integer, text, text) TO authenticated, service_role;

-- Guarda invoker: flag transacional + identidade do owner do comando; GUC do cliente não basta.
CREATE FUNCTION public.guard_issue415_settlement_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_op boolean := COALESCE(current_setting('app.settlement_contract_op',true),'') = 'on'
    AND current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid =
      'public._issue415_contract_command(text,uuid,text,boolean,boolean,integer,text,text)'::regprocedure));
  v_overhead boolean;
  v_count integer;
  v_settlement uuid;
BEGIN
  IF TG_TABLE_NAME = 'event_settlements' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.contract_expense_source IS NOT NULL OR NEW.contract_include_overhead IS NOT NULL
        OR NEW.contract_revision <> 0 OR NEW.contract_initialized_at IS NOT NULL OR NEW.contract_initialized_by IS NOT NULL
        THEN RAISE EXCEPTION 'Contrato só se inicializa pela RPC'; END IF;
      IF NEW.parent_id IS NOT NULL AND EXISTS (
        WITH RECURSIVE ancestors AS (
          SELECT s.id,s.parent_id,s.is_sealed,s.company_id,s.event_id FROM public.event_settlements s WHERE s.id=NEW.parent_id
          UNION SELECT s.id,s.parent_id,s.is_sealed,s.company_id,s.event_id FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
        ) SELECT 1 FROM ancestors WHERE is_sealed OR company_id IS DISTINCT FROM NEW.company_id OR event_id IS DISTINCT FROM NEW.event_id
      ) THEN RAISE EXCEPTION 'Ancestral selado ou fora do perímetro'; END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NOT v_op AND (NEW.contract_expense_source IS DISTINCT FROM OLD.contract_expense_source
        OR NEW.contract_include_overhead IS DISTINCT FROM OLD.contract_include_overhead
        OR NEW.contract_revision IS DISTINCT FROM OLD.contract_revision
        OR NEW.contract_initialized_at IS DISTINCT FROM OLD.contract_initialized_at
        OR NEW.contract_initialized_by IS DISTINCT FROM OLD.contract_initialized_by)
        THEN RAISE EXCEPTION 'Contrato só se altera pela RPC'; END IF;
      IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
        AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN RETURN NEW; END IF;
    END IF;
    -- Fechar reparent/delete/tenant moves que contornariam também uma decisão herdada.
    IF EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT s.id,s.parent_id,s.contract_initialized_at,s.is_sealed FROM public.event_settlements s WHERE s.id=OLD.id
        UNION SELECT s.id,s.parent_id,s.contract_initialized_at,s.is_sealed FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
      ) SELECT 1 FROM ancestors WHERE contract_initialized_at IS NOT NULL OR is_sealed
    ) THEN RAISE EXCEPTION 'Contrato configurado: remover/mover exige regularização própria'; END IF;
    IF TG_OP='UPDATE' AND NEW.parent_id IS NOT NULL AND EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT s.id,s.parent_id,s.contract_initialized_at,s.is_sealed,s.company_id,s.event_id FROM public.event_settlements s WHERE s.id=NEW.parent_id
        UNION SELECT s.id,s.parent_id,s.contract_initialized_at,s.is_sealed,s.company_id,s.event_id FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
      ) SELECT 1 FROM ancestors WHERE id=OLD.id OR contract_initialized_at IS NOT NULL OR is_sealed
        OR company_id IS DISTINCT FROM NEW.company_id OR event_id IS DISTINCT FROM NEW.event_id
    ) THEN RAISE EXCEPTION 'Mudança de ancestral contratual inválida'; END IF;
    IF EXISTS (WITH RECURSIVE descendants AS (
      SELECT s.id,s.contract_initialized_at,s.is_sealed FROM public.event_settlements s WHERE s.id=OLD.id
      UNION SELECT s.id,s.contract_initialized_at,s.is_sealed FROM public.event_settlements s JOIN descendants d ON s.parent_id=d.id
    ) SELECT 1 FROM descendants WHERE contract_initialized_at IS NOT NULL OR is_sealed)
      THEN RAISE EXCEPTION 'Contrato configurado: remover/mover exige regularização própria'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    IF EXISTS (WITH RECURSIVE ancestors AS (
      SELECT s.id,s.parent_id,s.is_sealed FROM public.event_settlements s WHERE s.id=NEW.settlement_id
      UNION SELECT s.id,s.parent_id,s.is_sealed FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
    ) SELECT 1 FROM ancestors WHERE is_sealed) THEN RAISE EXCEPTION 'Ancestral selado: reabra primeiro'; END IF;
    IF NOT NEW.supports_overhead THEN RAISE EXCEPTION 'Dispensa só se altera pela RPC'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NOT v_op AND NEW.supports_overhead IS DISTINCT FROM OLD.supports_overhead THEN RAISE EXCEPTION 'Dispensa só se altera pela RPC'; END IF;
    IF NOT NEW.supports_overhead AND (NEW.participant_kind IS DISTINCT FROM 'partner' OR NEW.mode IS DISTINCT FROM 'settles')
      THEN RAISE EXCEPTION 'Dispensa só para externo settles'; END IF;
    IF NEW.settlement_id IS DISTINCT FROM OLD.settlement_id OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
      IF NOT OLD.supports_overhead OR NOT NEW.supports_overhead THEN RAISE EXCEPTION 'Participante com dispensa não pode mudar de perímetro'; END IF;
    END IF;
  END IF;
  v_settlement := OLD.settlement_id;
  PERFORM id FROM public.event_settlements WHERE id=v_settlement FOR UPDATE;
  IF (TG_OP='DELETE' OR NEW.mode IS DISTINCT FROM OLD.mode OR NEW.supports_overhead IS DISTINCT FROM OLD.supports_overhead
      OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id OR NEW.participant_kind IS DISTINCT FROM OLD.participant_kind)
    AND EXISTS (WITH RECURSIVE ancestors AS (
      SELECT s.id,s.parent_id,s.is_sealed FROM public.event_settlements s WHERE s.id=v_settlement
      UNION SELECT s.id,s.parent_id,s.is_sealed FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
    ) SELECT 1 FROM ancestors WHERE is_sealed)
    THEN RAISE EXCEPTION 'Fechamento selado: reabra primeiro'; END IF;
  IF TG_OP='UPDATE' AND NEW.supports_overhead IS DISTINCT FROM OLD.supports_overhead AND OLD.frozen_at IS NOT NULL
    THEN RAISE EXCEPTION 'Sócio congelado'; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT s.*,0 depth FROM public.event_settlements s WHERE s.id=v_settlement
    UNION ALL SELECT s.*,a.depth+1 FROM public.event_settlements s JOIN ancestors a ON s.id=a.parent_id
  ) SELECT contract_include_overhead INTO v_overhead FROM ancestors
    WHERE contract_initialized_at IS NOT NULL AND contract_include_overhead IS NOT NULL ORDER BY depth LIMIT 1;
  SELECT count(*) INTO v_count FROM public.event_settlement_participants WHERE settlement_id=v_settlement AND mode='settles' AND id<>OLD.id;
  IF TG_OP='UPDATE' AND NEW.mode='settles' AND NEW.settlement_id=v_settlement THEN v_count:=v_count+1; END IF;
  IF v_overhead IS TRUE AND v_count < 2 AND (
    EXISTS (SELECT 1 FROM public.event_settlement_participants WHERE settlement_id=v_settlement AND id<>OLD.id AND NOT supports_overhead)
    OR (TG_OP='UPDATE' AND NEW.settlement_id=v_settlement AND NOT NEW.supports_overhead)
  ) THEN RAISE EXCEPTION 'Dispensa ativa exige pelo menos 2 settles'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_issue415_settlement_contract() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_issue415_settlement_contract BEFORE INSERT OR UPDATE OR DELETE ON public.event_settlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue415_settlement_contract();
CREATE TRIGGER trg_issue415_participant_overhead BEFORE INSERT OR UPDATE OR DELETE ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue415_settlement_contract();
