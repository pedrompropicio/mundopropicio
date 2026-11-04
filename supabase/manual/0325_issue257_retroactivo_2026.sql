-- Classe R2 — PREPARADA, NÃO APLICADA. DML; só na janela, com Sim, depois da 0319 e da lista aprovada.
-- #257 / D-ERP347 — autorização 6621059497; decisão B 6629856995: marcar só ids revistos.
-- Ordem da janela: deploy update-transaction → Publish → 0325 com a lista aprovada.
-- §A/§B reproduzem P da prova §3: são candidatas, nunca autorização para marcar.
-- A frente 4 confere cada fatura: taxa estrangeira = não recuperável;
-- IVA português recuperável fica de fora, mesmo quando o fornecedor é estrangeiro.
-- O Pedro vê a lista de ids aprovada e a contagem antes do «Corro?».

-- §A — Só leitura: candidatas de 2026 para conferência individual da fatura.
SELECT t.id, c.id AS company_id, c.name AS empresa, t.date AS data,
       s.name AS fornecedor, c.country AS pais_empresa, s.country AS pais_fornecedor,
       t.amount, t.iva_rate, round(t.amount * t.iva_rate / 100, 2) AS iva_potencial
FROM public.transactions AS t
JOIN public.companies AS c ON c.id = t.company_id
JOIN public.suppliers AS s ON s.id = t.supplier_id
WHERE t.type = 'expense'
  AND t.date >= DATE '2026-01-01' AND t.date < DATE '2027-01-01'
  AND t.iva_rate > 0
  AND s.country IS DISTINCT FROM c.country
ORDER BY c.name, c.id, t.date, t.id;

-- §B — Só leitura: contagem da prova §3 por empresa, para reconciliar a revisão.
SELECT c.id AS company_id, c.name AS company_name,
       count(*) AS candidatas,
       sum(t.amount * t.iva_rate / 100) AS iva_nao_recuperavel_potencial
FROM public.transactions AS t
JOIN public.companies AS c ON c.id = t.company_id
JOIN public.suppliers AS s ON s.id = t.supplier_id
WHERE t.type = 'expense'
  AND t.date >= DATE '2026-01-01' AND t.date < DATE '2027-01-01'
  AND t.iva_rate > 0
  AND s.country IS DISTINCT FROM c.country
GROUP BY c.id, c.name
ORDER BY c.name, c.id;

-- §C — Substituir o placeholder exclusivamente pelos ids revistos e aprovados.
-- Sem lista aprovada, o placeholder provoca erro; nunca substituir por uma query P.
-- A guarda aborta o bloco inteiro se faltar um id, houver duplicados, receita,
-- linha já marcada ou linha fora de 2026/com IVA zero. Não é reexecutável.
DO $$
DECLARE
  ids uuid[] := ARRAY[__IDS_APROVADOS__]::uuid[];
  n integer;
BEGIN
  IF coalesce(cardinality(ids), 0) = 0 THEN
    RAISE EXCEPTION '#257: lista aprovada vazia';
  END IF;

  UPDATE public.transactions
  SET vat_non_recoverable = true
  WHERE id = ANY(ids)
    AND type = 'expense'
    AND vat_non_recoverable = false
    AND date >= DATE '2026-01-01' AND date < DATE '2027-01-01'
    AND iva_rate > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> cardinality(ids) THEN
    RAISE EXCEPTION '#257: contagem divergente: % linhas alteradas para % ids aprovados', n, cardinality(ids);
  END IF;
END
$$;
