-- Defensive repair after earlier attachment-path migrations.
-- It chooses the first physically existing object among known legacy/current path shapes.

WITH tx_docs AS (
  SELECT
    td.id,
    td.file_url,
    COALESCE(td.company_id, t.company_id) AS company_id,
    CASE
      WHEN td.file_url LIKE 'camarim://%' THEN 'camarim-documents'
      ELSE 'transaction-documents'
    END AS bucket,
    CASE
      WHEN td.file_url LIKE 'camarim://%' THEN regexp_replace(td.file_url, '^camarim://', '')
      WHEN td.file_url LIKE 'http%' AND position('/storage/v1/object/public/transaction-documents/' IN td.file_url) > 0 THEN split_part(substring(td.file_url FROM position('/storage/v1/object/public/transaction-documents/' IN td.file_url) + length('/storage/v1/object/public/transaction-documents/')), '?', 1)
      WHEN td.file_url LIKE 'http%' AND position('/storage/v1/object/sign/transaction-documents/' IN td.file_url) > 0 THEN split_part(substring(td.file_url FROM position('/storage/v1/object/sign/transaction-documents/' IN td.file_url) + length('/storage/v1/object/sign/transaction-documents/')), '?', 1)
      ELSE regexp_replace(coalesce(td.file_url, ''), '^/+', '')
    END AS path
  FROM public.transaction_documents td
  LEFT JOIN public.transactions t ON t.id = td.transaction_id
  WHERE td.file_url IS NOT NULL
    AND td.file_url NOT LIKE 'ref://%'
    AND td.file_url NOT LIKE 'http://%'
    AND td.file_url NOT LIKE 'https://%'
), tx_candidates AS (
  SELECT id, file_url, bucket, path, 10 AS pr, path AS candidate_path FROM tx_docs
  UNION ALL
  SELECT id, file_url, bucket, path, 20, company_id::text || '/' || path FROM tx_docs WHERE company_id IS NOT NULL AND path NOT LIKE company_id::text || '/%'
  UNION ALL
  SELECT id, file_url, bucket, path, 30, regexp_replace(path, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', '') FROM tx_docs WHERE path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  UNION ALL
  SELECT id, file_url, bucket, path, 40, company_id::text || '/' || regexp_replace(path, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', '') FROM tx_docs WHERE company_id IS NOT NULL AND path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
), tx_best AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    c.bucket,
    c.candidate_path
  FROM tx_candidates c
  JOIN storage.objects o ON o.bucket_id = c.bucket AND o.name = c.candidate_path
  ORDER BY c.id, c.pr
)
UPDATE public.transaction_documents td
SET file_url = CASE WHEN b.bucket = 'camarim-documents' THEN 'camarim://' || b.candidate_path ELSE b.candidate_path END
FROM tx_best b
WHERE b.id = td.id
  AND td.file_url IS DISTINCT FROM CASE WHEN b.bucket = 'camarim-documents' THEN 'camarim://' || b.candidate_path ELSE b.candidate_path END;

WITH cam_docs AS (
  SELECT
    cid.id,
    cid.file_path,
    COALESCE(cid.company_id, ci.company_id, cs.company_id) AS company_id,
    regexp_replace(coalesce(cid.file_path, ''), '^/+', '') AS path
  FROM public.camarim_item_documents cid
  LEFT JOIN public.camarim_items ci ON ci.id = cid.item_id
  LEFT JOIN public.camarim_sessions cs ON cs.id = ci.session_id
  WHERE cid.file_path IS NOT NULL
    AND cid.file_path NOT LIKE 'http://%'
    AND cid.file_path NOT LIKE 'https://%'
), cam_candidates AS (
  SELECT id, file_path, 10 AS pr, path AS candidate_path FROM cam_docs
  UNION ALL
  SELECT id, file_path, 20, company_id::text || '/' || path FROM cam_docs WHERE company_id IS NOT NULL AND path NOT LIKE company_id::text || '/%'
  UNION ALL
  SELECT id, file_path, 30, regexp_replace(path, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', '') FROM cam_docs WHERE path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  UNION ALL
  SELECT id, file_path, 40, company_id::text || '/' || regexp_replace(path, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', '') FROM cam_docs WHERE company_id IS NOT NULL AND path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
), cam_best AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    c.candidate_path
  FROM cam_candidates c
  JOIN storage.objects o ON o.bucket_id = 'camarim-documents' AND o.name = c.candidate_path
  ORDER BY c.id, c.pr
)
UPDATE public.camarim_item_documents cid
SET file_path = b.candidate_path
FROM cam_best b
WHERE b.id = cid.id
  AND cid.file_path IS DISTINCT FROM b.candidate_path;