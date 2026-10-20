CREATE OR REPLACE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_sum numeric; v_pending int;
BEGIN
  SELECT * INTO s FROM public.ticket_office_statements WHERE id = p_statement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuramento não encontrado.'; END IF;
  IF NOT public.row_belongs_to_current_company(s.company_id) THEN RAISE EXCEPTION 'Sem acesso a este apuramento.'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Só admin ou manager confirmam apuramentos.';
  END IF;
  IF s.status = 'confirmed' THEN RAISE EXCEPTION 'Apuramento já confirmado.'; END IF;
  IF s.document_total IS NULL THEN RAISE EXCEPTION 'Falta o total do documento.'; END IF;
  SELECT count(*) FILTER (WHERE pending_document), COALESCE(sum(amount),0)
    INTO v_pending, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = p_statement_id;
  IF v_pending > 0 THEN RAISE EXCEPTION 'Há % linha(s) pendente(s) de documento.', v_pending; END IF;
  IF abs(round(v_sum,2) - s.document_total) > 0.004 THEN
    RAISE EXCEPTION 'Σ linhas (%) ≠ total do documento (%).', round(v_sum,2), s.document_total;
  END IF;
  UPDATE public.ticket_office_statements SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid(), updated_at=now()
   WHERE id = p_statement_id;
END $function$;
