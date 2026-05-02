-- Camarim item documents
UPDATE camarim_item_documents AS cid
SET file_path = (ci.company_id::text || '/' || cid.file_path)
FROM camarim_items ci
WHERE ci.id = cid.item_id
  AND cid.file_path IS NOT NULL
  AND cid.file_path NOT LIKE 'http://%'
  AND cid.file_path NOT LIKE 'https://%'
  AND cid.file_path NOT LIKE (ci.company_id::text || '/%');

-- Ticket office settlements
UPDATE ticket_office_settlements
SET document_url = (company_id::text || '/' || document_url)
WHERE document_url IS NOT NULL
  AND document_url NOT LIKE 'http://%'
  AND document_url NOT LIKE 'https://%'
  AND document_url NOT LIKE (company_id::text || '/%');