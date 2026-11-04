-- Issue #213 / 0321 — prova de janela, exclusivamente de leitura.
-- Preparada sob 6621056537; execução pelo 0 na janela autorizada.
-- Conservar os resultados fora da BD, com os IDs e URLs originais da §1.
-- Ordem: §4 antes, §1 e §2 antes; §3 e §4 depois da reparação autorizada.

-- §1 — candidatos: esperado 11, todos nas duas transações do cartão 0663.
-- Total diferente de 11 (incluindo resultado vazio): NÃO APLICAR.
-- Conferir os IDs completos das duas transações e guardar os 11 IDs de documento.
WITH caminhos AS (
  SELECT td.id, td.transaction_id, td.file_url,
    substring(td.file_url from 11) AS caminho_actual,
    regexp_replace(td.file_url,
      '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/', '') AS novo_caminho,
    regexp_replace(td.file_url,
      '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/', 'camarim://') AS novo_file_url
  FROM public.transaction_documents td
  WHERE td.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
    AND td.file_url LIKE 'camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/%'
    AND (td.transaction_id::text LIKE '6b58adf0-%' OR td.transaction_id::text LIKE '3ea19905-%')
), verificados AS (
  SELECT c.*,
    EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'camarim-documents' AND o.name = c.caminho_actual) AS objecto_actual_existe,
    EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'camarim-documents' AND o.name = c.novo_caminho) AS objecto_destino_existe
  FROM caminhos c
)
SELECT id, transaction_id, file_url, caminho_actual, novo_caminho, novo_file_url,
  objecto_actual_existe, objecto_destino_existe, count(*) OVER () AS total_candidatos
FROM verificados
WHERE NOT objecto_actual_existe AND objecto_destino_existe
ORDER BY transaction_id, id;

-- §2 — referências camarim:// da MP sem objecto em nenhum dos dois caminhos.
-- Só registo: esta lista não alarga o âmbito da reparação.
SELECT td.id, td.transaction_id, td.file_url
FROM public.transaction_documents td
WHERE td.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
  AND td.file_url LIKE 'camarim://%'
  AND NOT EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = substring(td.file_url from 11))
  AND NOT EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = regexp_replace(td.file_url,
        '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/', ''))
ORDER BY td.transaction_id, td.id;

-- §3 — depois: os mesmos 11 IDs, com objecto no caminho efectivamente gravado.
-- Preencher ARRAY[]::uuid[] com os 11 IDs da §1, entre aspas e com vírgulas.
-- Sem preencher, as contagens são zero e prova_ok é false: prova incompleta.
-- Exigir ids_na_prova = ids_distintos = linhas_encontradas = referencias_validas = 11.
WITH ids_da_prova AS (
  SELECT unnest(ARRAY[]::uuid[]) AS id
), verificados AS (
  SELECT p.id AS id_da_prova, td.id, td.transaction_id, td.company_id, td.file_url,
    EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'camarim-documents'
        AND o.name = substring(td.file_url from 11)) AS objecto_gravado_existe
  FROM ids_da_prova p
  LEFT JOIN public.transaction_documents td ON td.id = p.id
), resumo AS (
  SELECT count(*)::int AS ids_na_prova,
    count(DISTINCT id_da_prova)::int AS ids_distintos,
    count(id)::int AS linhas_encontradas,
    count(*) FILTER (WHERE company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
      AND file_url LIKE 'camarim://%'
      AND file_url NOT LIKE 'camarim://7c858982-%'
      AND (transaction_id::text LIKE '6b58adf0-%' OR transaction_id::text LIKE '3ea19905-%')
      AND objecto_gravado_existe)::int AS referencias_validas,
    coalesce(jsonb_agg(jsonb_build_object('id', id_da_prova,
      'transaction_id', transaction_id, 'file_url', file_url,
      'objecto_gravado_existe', objecto_gravado_existe) ORDER BY id_da_prova), '[]'::jsonb) AS documentos
  FROM verificados
)
SELECT *, (ids_na_prova = 11 AND ids_distintos = 11
  AND linhas_encontradas = 11 AND referencias_validas = 11) AS prova_ok
FROM resumo;

-- §3 (continuação) — esperado: 0 candidatos restantes; não basta só esta contagem.
SELECT count(*)::int AS candidatos_restantes
FROM public.transaction_documents td
WHERE td.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
  AND td.file_url LIKE 'camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/%'
  AND (td.transaction_id::text LIKE '6b58adf0-%' OR td.transaction_id::text LIKE '3ea19905-%')
  AND NOT EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents' AND o.name = substring(td.file_url from 11))
  AND EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = regexp_replace(td.file_url,
        '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/', ''));

-- §4 — executar esta mesma leitura antes e depois e conservar ambos os resultados.
-- Aceitar apenas total_camarim_mp antes = total_camarim_mp depois.
SELECT count(*)::int AS total_camarim_mp
FROM public.transaction_documents td
WHERE td.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
  AND td.file_url LIKE 'camarim://%';
