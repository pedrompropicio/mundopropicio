-- #303 (D-ERP232): fecho mostra o direito do evento; forma de liquidação derivada + correcção manual.
ALTER TABLE public.ticket_office_settlements
  ADD COLUMN IF NOT EXISTS forma_liquidacao_manual text
    CHECK (forma_liquidacao_manual IS NULL OR forma_liquidacao_manual IN ('transferencia','encontro_de_contas','compensado','por_liquidar','apuramento')),
  ADD COLUMN IF NOT EXISTS forma_liquidacao_manual_notes text,
  ADD COLUMN IF NOT EXISTS gross_adjustment_notes text;

COMMENT ON COLUMN public.ticket_office_settlements.net_calculated IS
  'Direito do evento (D-ERP232) = bruto − deduções − retido pela sala − saldo de fatura pago pela bilheteira. Adiantamentos/repasses NÃO entram: vivem no Apuramento Ticketline.';
COMMENT ON COLUMN public.ticket_office_settlements.forma_liquidacao_manual IS
  'Forma de liquidação DECLARADA à mão (D-ERP232). NULL = vale a derivada por get_ticket_office_settlements_overview.';
COMMENT ON COLUMN public.ticket_office_settlements.gross_adjustment_notes IS
  'Justificação obrigatória quando a receita bruta foi ajustada à mão (D-ERP232).';

-- E) adiantamentos: nenhum pode voltar a entrar no ramo "aberto" de _ticket_office_balance_raw
-- (que só subtrai os que têm transaction_id E settlement_id a NULL), e o histórico não se apaga.
ALTER TABLE public.event_ticket_office_advances
  ADD CONSTRAINT etoa_never_open_chk CHECK (transaction_id IS NOT NULL OR settlement_id IS NOT NULL);

DROP TRIGGER IF EXISTS trg_block_ticket_office_advances_write ON public.event_ticket_office_advances;
CREATE TRIGGER trg_block_ticket_office_advances_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_ticket_office_advances
  FOR EACH ROW EXECUTE FUNCTION public.block_ticket_office_advances_write();

DROP FUNCTION IF EXISTS public.get_ticket_office_settlements_overview(uuid, uuid);
CREATE FUNCTION public.get_ticket_office_settlements_overview(_event_id uuid DEFAULT NULL::uuid, _office_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_id uuid, event_name text, office_id uuid, office_name text, settlement_date date, status text,
               gross_revenue numeric, total_deductions numeric, net_value numeric, net_transferred numeric,
               forma_liquidacao text, forma_derivada text, forma_manual text, forma_manual_notes text,
               statement_id uuid, statement_number text, notes text, adjustment_notes text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select s.*, e.name as ev_name, fa.name as fa_name, st.number::text as st_number,
           case
             when s.transfer_transaction_id is not null then 'transferencia'
             when s.statement_id is not null then 'apuramento'
             when abs(coalesce(s.net_adjusted, s.net_calculated, 0)) < 0.01 then 'compensado'
             when coalesce(s.net_transferred, 0) > 0 then 'encontro_de_contas'
             when (select coalesce(sum(a.amount),0) from public.event_ticket_office_advances a where a.settlement_id = s.id)
                  >= coalesce(s.net_adjusted, s.net_calculated, 0) - 0.01 then 'compensado'
             else 'por_liquidar'
           end as derivada,
           e.parent_event_id as ev_parent
      from public.ticket_office_settlements s
      left join public.events e on e.id = s.event_id
      left join public.financial_accounts fa on fa.id = s.financial_account_id
      left join public.ticket_office_statements st on st.id = s.statement_id
     where public.row_belongs_to_current_company(s.company_id)
  )
  select b.id, b.event_id, b.ev_name, b.financial_account_id, b.fa_name, b.settlement_date, b.status,
         b.gross_revenue, b.total_deductions, coalesce(b.net_adjusted, b.net_calculated), b.net_transferred,
         coalesce(b.forma_liquidacao_manual, b.derivada), b.derivada, b.forma_liquidacao_manual, b.forma_liquidacao_manual_notes,
         b.statement_id, b.st_number, b.notes, b.adjustment_notes
    from base b
   where (_event_id is null or b.event_id = _event_id or b.ev_parent = _event_id)
     and (_office_id is null or b.financial_account_id = _office_id)
   order by b.settlement_date desc nulls last, b.created_at desc
$function$;

REVOKE ALL ON FUNCTION public.get_ticket_office_settlements_overview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_office_settlements_overview(uuid, uuid) TO authenticated;