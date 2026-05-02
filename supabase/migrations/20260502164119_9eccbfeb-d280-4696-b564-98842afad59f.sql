-- Guarded normalization for transaction attachment paths after multi-company storage isolation.
-- Only rewrites a database reference when the physical object already exists at the target path.

UPDATE public.transaction_documents AS td
SET file_url = (COALESCE(td.company_id, t.company_id)::text || '/' || td.file_url)
FROM public.transactions t
WHERE t.id = td.transaction_id
  AND COALESCE(td.company_id, t.company_id) IS NOT NULL
  AND td.file_url IS NOT NULL
  AND td.file_url NOT LIKE 'ref://%'
  AND td.file_url NOT LIKE 'http://%'
  AND td.file_url NOT LIKE 'https://%'
  AND td.file_url NOT LIKE 'camarim://%'
  AND td.file_url NOT LIKE (COALESCE(td.company_id, t.company_id)::text || '/%')
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'transaction-documents'
      AND o.name = (COALESCE(td.company_id, t.company_id)::text || '/' || td.file_url)
  );

UPDATE public.transaction_documents AS td
SET file_url = ('camarim://' || COALESCE(td.company_id, t.company_id)::text || '/' || substring(td.file_url from 11))
FROM public.transactions t
WHERE t.id = td.transaction_id
  AND COALESCE(td.company_id, t.company_id) IS NOT NULL
  AND td.file_url LIKE 'camarim://%'
  AND substring(td.file_url from 11) NOT LIKE (COALESCE(td.company_id, t.company_id)::text || '/%')
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'camarim-documents'
      AND o.name = (COALESCE(td.company_id, t.company_id)::text || '/' || substring(td.file_url from 11))
  );