-- Remove redundant broad SELECT policy on transaction-documents.
-- "Staff can view transaction docs" + company_isolation_transaction_documents_select
-- already enforce role + tenant isolation. The broad policy gave any authenticated
-- user permissive access (still narrowed by RESTRICTIVE isolation, but reduces
-- policy surface and clarifies intent).
DROP POLICY IF EXISTS "Authenticated users can view transaction docs" ON storage.objects;