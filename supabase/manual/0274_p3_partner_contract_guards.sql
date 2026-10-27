-- P3 passo 4. PREPARADO, NÃO APLICADO. Sem BEGIN/COMMIT: transação gerida pela ferramenta.
-- Escritas em contratos e na identidade/valor das transações ligadas só dentro das RPCs do 0273
-- (flag local app.partner_contract_op='on'). Pagamento/conciliação/status/conta continuam livres.
CREATE OR REPLACE FUNCTION public.guard_partner_contract_transactions()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('app.partner_contract_op',true),'')='on' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.partner_contract_id IS NOT NULL OR NEW.partner_contract_role IS NOT NULL THEN
      RAISE EXCEPTION 'transacao_de_contrato_so_por_rpc: use os contratos do sócio' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.partner_contract_id IS NOT NULL OR OLD.partner_contract_role IS NOT NULL THEN
      RAISE EXCEPTION 'transacao_de_contrato_so_por_rpc: cancele o contrato' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF (OLD.partner_contract_id IS NOT NULL OR OLD.partner_contract_role IS NOT NULL
      OR NEW.partner_contract_id IS NOT NULL OR NEW.partner_contract_role IS NOT NULL)
    AND (NEW.amount,NEW.category_id,NEW.supplier_id,NEW.event_id,NEW.company_id,NEW.type,
         NEW.partner_contract_id,NEW.partner_contract_role,NEW.parent_transaction_id)
      IS DISTINCT FROM
        (OLD.amount,OLD.category_id,OLD.supplier_id,OLD.event_id,OLD.company_id,OLD.type,
         OLD.partner_contract_id,OLD.partner_contract_role,OLD.parent_transaction_id) THEN
    RAISE EXCEPTION 'transacao_de_contrato_so_por_rpc: valor/identidade protegidos' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_partner_payment_contracts()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE p public.event_settlement_participants; sealed boolean; share numeric; n integer; used numeric;
BEGIN
  IF coalesce(current_setting('app.partner_contract_op',true),'') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'contrato_so_por_rpc' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN RAISE EXCEPTION 'contrato_cancelado_nao_reativa'; END IF;
    IF (NEW.gross,NEW.participant_id,NEW.company_id,NEW.event_id,NEW.settlement_id)
      IS DISTINCT FROM (OLD.gross,OLD.participant_id,OLD.company_id,OLD.event_id,OLD.settlement_id) THEN
      RAISE EXCEPTION 'contrato_identidade_imutavel';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO p FROM public.event_settlement_participants WHERE id=NEW.participant_id;
  IF p.id IS NULL OR p.company_id IS DISTINCT FROM NEW.company_id OR p.event_id IS DISTINCT FROM NEW.event_id
    OR p.settlement_id IS DISTINCT FROM NEW.settlement_id THEN RAISE EXCEPTION 'contrato_participante_inconsistente'; END IF;
  IF p.mode IS DISTINCT FROM 'settles' OR p.frozen_at IS NULL THEN RAISE EXCEPTION 'socio_nao_congelado'; END IF;
  SELECT is_sealed INTO sealed FROM public.event_settlements WHERE id=p.settlement_id;
  IF coalesce(sealed,false) THEN RAISE EXCEPTION 'fechamento_selado'; END IF;
  IF jsonb_typeof(p.frozen_values->'share_amount') IS NULL
     OR jsonb_typeof(p.frozen_values->'share_amount') NOT IN ('number','string') THEN RAISE EXCEPTION 'parte_congelada_em_falta'; END IF;
  BEGIN share := (p.frozen_values->>'share_amount')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'parte_congelada_invalida'; END;
  IF share IS NULL OR share::text IN ('NaN','Infinity','-Infinity') OR share<0 THEN RAISE EXCEPTION 'parte_congelada_invalida'; END IF;
  SELECT count(*),coalesce(sum(gross),0) INTO n,used FROM public.partner_payment_contracts
    WHERE participant_id=NEW.participant_id AND cancelled_at IS NULL;
  IF NEW.cancelled_at IS NULL AND n>=4 THEN RAISE EXCEPTION 'limite_contratos: máximo 4'; END IF;
  IF NEW.cancelled_at IS NULL AND used+NEW.gross>share THEN RAISE EXCEPTION 'parte_excedida'; END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.guard_partner_contract_transactions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_partner_payment_contracts() FROM PUBLIC, anon, authenticated, service_role;

-- "zzz_" corre depois dos BEFORE existentes (ordem alfabética), vendo o NEW final.
CREATE TRIGGER zzz_partner_contract_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_partner_contract_transactions();
CREATE TRIGGER zzz_partner_payment_contracts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.partner_payment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_partner_payment_contracts();
