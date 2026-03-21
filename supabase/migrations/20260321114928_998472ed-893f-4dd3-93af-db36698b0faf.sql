
-- Remove anon policies from transactions
DROP POLICY IF EXISTS "Transactions are viewable by everyone" ON public.transactions;
DROP POLICY IF EXISTS "Transactions can be managed by everyone" ON public.transactions;

-- Remove anon policies from suppliers
DROP POLICY IF EXISTS "Suppliers are viewable by everyone" ON public.suppliers;
DROP POLICY IF EXISTS "Suppliers can be managed by everyone" ON public.suppliers;

-- Remove anon policies from quotations
DROP POLICY IF EXISTS "Quotations are viewable by everyone" ON public.quotations;
DROP POLICY IF EXISTS "Quotations can be managed by everyone" ON public.quotations;

-- Remove anon policies from supplier_documents
DROP POLICY IF EXISTS "Supplier documents are viewable by everyone" ON public.supplier_documents;
DROP POLICY IF EXISTS "Supplier documents can be managed by everyone" ON public.supplier_documents;

-- Remove anon policies from account_categories
DROP POLICY IF EXISTS "Account categories are viewable by everyone" ON public.account_categories;

-- Remove anon policies from transaction_audit_log
DROP POLICY IF EXISTS "Audit log is viewable by everyone" ON public.transaction_audit_log;
DROP POLICY IF EXISTS "Audit log can be inserted by everyone" ON public.transaction_audit_log;

-- Remove anon policies from events
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
