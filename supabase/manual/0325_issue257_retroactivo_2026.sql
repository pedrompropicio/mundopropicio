-- Classe R2 — PREPARADA, NÃO APLICADA. DML; só na janela, com Sim, depois da 0319 e da lista aprovada.
-- #257 / D-ERP347 — autorização 6621059497; decisão B 6629856995: marcar só ids revistos.
-- Ordem da janela: deploy update-transaction → Publish → 0325 com a lista aprovada.
-- §A/§B listam despesas de 2026 com IVA ainda não marcado, com ou sem fornecedor.
-- São candidatas para a frente 4 conferir fatura a fatura, nunca autorização para marcar.
-- taxa_fora_do_pais apenas ordena a revisão; não decide a recuperabilidade do IVA.
-- Taxas do selector: src/components/IvaRateSelect.tsx:27 → src/lib/iva.ts:6 →
-- supabase/functions/_shared/settlement/iva.ts:24–27 (PT 0/6/13/23; ES 0/4/10/21).
-- País desconhecido/nulo usa PT, como getIvaRatesForCountry nesse ficheiro:32–34.
-- Limitação do ERP: a lista PT só cobre o Continente, sem taxas da Madeira/Açores.
-- O Pedro vê a lista de ids aprovada e a contagem antes do «Corro?».

-- §A — Só leitura: candidatas de 2026 para conferência individual da fatura.
SELECT t.id, c.id AS company_id, c.display_name AS empresa, t.date AS data,
       t.description AS descricao,
       s.name AS fornecedor, c.country AS pais_empresa, s.country AS pais_fornecedor,
       t.amount, t.iva_rate, round(t.amount * t.iva_rate / 100, 2) AS iva_potencial,
       CASE WHEN c.country IN ('ES', 'Espanha') THEN t.iva_rate NOT IN (0, 4, 10, 21)
            ELSE t.iva_rate NOT IN (0, 6, 13, 23)
       END AS taxa_fora_do_pais
FROM public.transactions AS t
JOIN public.companies AS c ON c.id = t.company_id
LEFT JOIN public.suppliers AS s ON s.id = t.supplier_id
WHERE t.type = 'expense'
  AND t.date >= DATE '2026-01-01' AND t.date < DATE '2027-01-01'
  AND t.iva_rate > 0
  AND t.vat_non_recoverable = false
ORDER BY taxa_fora_do_pais DESC, c.display_name, t.date, t.id;

-- §B — Só leitura: contagem e soma do IVA da §A por empresa e taxa, para reconciliar a revisão.
SELECT c.id AS company_id, c.display_name AS company_name, t.iva_rate,
       CASE WHEN c.country IN ('ES', 'Espanha') THEN t.iva_rate NOT IN (0, 4, 10, 21)
            ELSE t.iva_rate NOT IN (0, 6, 13, 23)
       END AS taxa_fora_do_pais,
       count(*) AS candidatas,
       sum(round(t.amount * t.iva_rate / 100, 2)) AS iva_nao_recuperavel_potencial
FROM public.transactions AS t
JOIN public.companies AS c ON c.id = t.company_id
WHERE t.type = 'expense'
  AND t.date >= DATE '2026-01-01' AND t.date < DATE '2027-01-01'
  AND t.iva_rate > 0
  AND t.vat_non_recoverable = false
GROUP BY c.id, c.display_name, c.country, t.iva_rate
ORDER BY taxa_fora_do_pais DESC, c.display_name, c.id, t.iva_rate;

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
