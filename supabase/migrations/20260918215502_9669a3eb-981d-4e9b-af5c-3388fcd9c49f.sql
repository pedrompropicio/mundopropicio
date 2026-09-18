-- #125 — o critério de "linha sem evento" vive UMA vez, aqui.
-- União dos dois critérios que existiam: a lista escondia as linhas com evento
-- mas match_source='none' (resolução falhada que deixou o evento antigo lá);
-- o detalhe e o checkReady já as contavam. Ganha o critério mais rigoroso.
-- 'fora_sistema' é decisão humana: a linha não pertence a evento nenhum e não é órfã.
CREATE OR REPLACE FUNCTION public.ads_invoice_line_is_pending(l public.ads_invoice_line)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT COALESCE(l.is_adjustment, false)
     AND COALESCE(l.match_source, '') <> 'fora_sistema'
     AND (l.event_id IS NULL OR l.match_source = 'none')
$$;

-- Contagem agregada por fatura: nunca devolve mais linhas do que faturas pedidas,
-- por isso a barreira dos 1.000 do PostgREST não se aplica. SECURITY INVOKER: a RLS
-- de ads_invoice_line continua a decidir o que cada utilizador vê.
CREATE OR REPLACE FUNCTION public.ads_invoice_pending_counts(p_invoice_ids uuid[])
RETURNS TABLE (invoice_id uuid, total_lines int, pending_lines int)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.invoice_id,
         COUNT(*)::int,
         COUNT(*) FILTER (WHERE public.ads_invoice_line_is_pending(l))::int
  FROM public.ads_invoice_line l
  WHERE l.invoice_id = ANY(COALESCE(p_invoice_ids, '{}'::uuid[]))
  GROUP BY l.invoice_id
$$;

REVOKE ALL ON FUNCTION public.ads_invoice_line_is_pending(public.ads_invoice_line) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ads_invoice_pending_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ads_invoice_line_is_pending(public.ads_invoice_line) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_pending_counts(uuid[]) TO authenticated, service_role;