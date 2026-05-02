-- Normalize transaction_documents.file_url so every storage path starts with the
-- owning company's id. Idempotent: rows already correctly prefixed are skipped.

-- 1) "Plain" storage paths (transaction-documents bucket).
UPDATE transaction_documents AS td
SET file_url = (t.company_id::text || '/' || td.file_url)
FROM transactions t
WHERE t.id = td.transaction_id
  AND td.file_url IS NOT NULL
  AND td.file_url NOT LIKE 'ref://%'
  AND td.file_url NOT LIKE 'http://%'
  AND td.file_url NOT LIKE 'https://%'
  AND td.file_url NOT LIKE 'camarim://%'
  AND td.file_url NOT LIKE (t.company_id::text || '/%');

-- 2) Camarim paths (camarim-documents bucket) — preserve the protocol prefix.
UPDATE transaction_documents AS td
SET file_url = ('camarim://' || t.company_id::text || '/' || substring(td.file_url from 11))
FROM transactions t
WHERE t.id = td.transaction_id
  AND td.file_url LIKE 'camarim://%'
  AND substring(td.file_url from 11) NOT LIKE (t.company_id::text || '/%');