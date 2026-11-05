-- #312 / 0320 — prova preparada, só leitura; não executada em Live nesta tarefa.
-- O 0 corre na janela autorizada e guarda os resultados antes/depois fora deste script.
-- §1 e §2: antes; §3: depois; §4: antes E depois, guardando ambas as leituras.

-- §1 — Situação por empresa, incluindo empresas sem pai ou sem a rubrica.
SELECT co.id AS company_id, co.display_name AS empresa,
       p.id AS pai_26_id, p.name AS pai_26_nome, p.type AS pai_26_tipo,
       COALESCE(p.is_active AND p.type = 'expense', false) AS tem_26_activa,
       c.id AS rubrica_2615_id, c.name AS rubrica_2615_nome,
       c.parent_id AS rubrica_2615_pai, c.event_required,
       c.is_active AS rubrica_2615_activa, c.allocate_to_active_event
FROM public.companies co
LEFT JOIN public.account_categories p ON p.company_id = co.id AND p.code = '2.6'
LEFT JOIN public.account_categories c ON c.company_id = co.id AND c.code = '2.6.15'
ORDER BY co.id;

-- §1 — Nomes fora do padrão, preservados pela 0320, apresentados à parte.
SELECT c.company_id, co.display_name AS empresa, c.id, c.name, c.parent_id, c.event_required
FROM public.account_categories c
JOIN public.companies co ON co.id = c.company_id
WHERE c.code = '2.6.15'
  AND c.name IS DISTINCT FROM 'Encargos Bancários e Taxas de Transferência'
ORDER BY c.company_id;

-- §1 — Guardar esta lista ANTES; alimenta __IDS_2615_ANTES__ no rollback comentado.
SELECT count(*)::int AS total_2615_antes,
       COALESCE(string_agg(quote_literal(id::text) || '::uuid', ', ' ORDER BY id),
                'SELECT NULL::uuid WHERE false') AS ids_2615_antes
FROM public.account_categories
WHERE code = '2.6.15';

-- §2 — Empresas que devem ganhar uma rubrica; nomes existentes não são candidatos.
SELECT p.company_id, co.display_name AS empresa, p.id AS pai_26_id
FROM public.account_categories p
JOIN public.companies co ON co.id = p.company_id
WHERE p.code = '2.6' AND p.type = 'expense' AND p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.account_categories c
    WHERE c.company_id = p.company_id AND c.code = '2.6.15'
  )
ORDER BY p.company_id;

SELECT count(*)::int AS insercoes_esperadas
FROM public.account_categories p
WHERE p.code = '2.6' AND p.type = 'expense' AND p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.account_categories c
    WHERE c.company_id = p.company_id AND c.code = '2.6.15'
  );

-- §3 — Depois: uma 2.6.15 por empresa elegível, pai próprio e evento obrigatório.
-- Confrontar com §1: rubricas já existentes ficam intactas mesmo com divergências;
-- empresas sem 2.6 de despesa activa não recebem rubrica por esta migração.
SELECT co.id AS company_id, co.display_name AS empresa,
       COALESCE(p.is_active AND p.type = 'expense', false) AS elegivel_0320,
       count(c.id)::int AS quantidade_2615,
       count(c.id) = 1 AS uma_2615,
       COALESCE(bool_and(c.parent_id = p.id AND p.company_id = c.company_id), false) AS pai_26_da_empresa,
       COALESCE(bool_and(c.event_required), false) AS evento_obrigatorio,
       COALESCE(bool_and(c.is_active), false) AS rubrica_activa,
       COALESCE(bool_and(NOT c.allocate_to_active_event), false) AS sem_alocacao_automatica
FROM public.companies co
LEFT JOIN public.account_categories p ON p.company_id = co.id AND p.code = '2.6'
LEFT JOIN public.account_categories c ON c.company_id = co.id AND c.code = '2.6.15'
GROUP BY co.id, co.display_name, p.id, p.is_active, p.type
ORDER BY co.id;

-- §4 — Correr ANTES e DEPOIS; diferença em ambos os totais = §2 insercoes_esperadas.
-- Comparar também os IDs/nomes/pais/flags de §1: nenhuma rubrica anterior deve mudar.
SELECT count(*)::int AS total_categorias,
       count(*) FILTER (WHERE code = '2.6.15')::int AS total_2615,
       count(DISTINCT company_id) FILTER (WHERE code = '2.6.15')::int AS empresas_com_2615
FROM public.account_categories;
