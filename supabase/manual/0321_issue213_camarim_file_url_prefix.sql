-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Issue #213, E2b — cartão 0663, camarim H&K Coliseu Lisboa, abril/2026.
-- Autorização de preparação: 6621056537; origem: comentário 6125883594
-- (12/10/2026), triagem 6610096165 e numeração 0321 em 6619510288 (04/11/2026).
-- Aplicação exclusiva pelo 0 na janela, com «Sim» do Pedro.
-- Esperado: 11 linhas (prova §1 em docs/testes/issue213/prova-janela.sql).
-- Se a prova não devolver exactamente 11 linhas nas duas transações, não aplicar.
-- Guardar os IDs e URLs originais da prova §1 antes de aplicar; repetir a prova
-- §4 antes/depois. Segunda execução deste ficheiro: 0 linhas alteradas.
-- Rollback: rollback_0321_issue213_camarim_file_url_prefix_comentado.sql,
-- apenas com os IDs guardados na prova e autorização própria para a reversão.
-- Reparação DML manual dependente de storage Live: sem cópia em drizzle/.

UPDATE public.transaction_documents td
SET file_url = regexp_replace(
  td.file_url,
  '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/',
  'camarim://'
)
WHERE td.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
  AND td.file_url LIKE 'camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/%'
  AND (
    td.transaction_id::text LIKE '6b58adf0-%'
    OR td.transaction_id::text LIKE '3ea19905-%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = substring(td.file_url from 11)
  )
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = regexp_replace(
        td.file_url,
        '^camarim://7c858982-6ccd-47ca-bd65-e0dd3eebf01c/',
        ''
      )
  );
