-- #257 — prova preparada para a janela; só SELECT. Não executada em Live.
-- Executar cada secção no momento indicado, pelo PROC-promocao.

-- §1 Antes: coluna_existe deve ser false.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'transactions'
    AND column_name = 'vat_non_recoverable'
) AS coluna_existe;

-- §2 Depois: boolean, NO, false; total_true deve ser 0 antes de usar o formulário.
SELECT data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions'
  AND column_name = 'vat_non_recoverable';

SELECT count(*) AS total_true
FROM public.transactions
WHERE vat_non_recoverable IS TRUE;

-- §3 Candidatas ao retroactivo de 2026, por empresa: contagem, sem UPDATE.
-- Estimativa pela taxa de cada transação, não constitui decisão de marcação.
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
