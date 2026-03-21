
-- ==========================================
-- REFORÇO DE RLS: Substituir políticas abertas por role-based
-- ==========================================

-- 1. TRANSACTIONS: Separar SELECT/INSERT/UPDATE/DELETE com roles
DROP POLICY IF EXISTS "Transactions can be managed by authenticated users" ON public.transactions;

-- Qualquer autenticado pode inserir
CREATE POLICY "Transactions insertable by authenticated"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (true);

-- Qualquer autenticado pode atualizar (regras de negócio no app)
CREATE POLICY "Transactions updatable by authenticated"
ON public.transactions FOR UPDATE TO authenticated
USING (true);

-- Apenas admin/manager podem eliminar
CREATE POLICY "Transactions deletable by admin or manager"
ON public.transactions FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 2. SUPPLIERS: Separar operações
DROP POLICY IF EXISTS "Suppliers can be managed by authenticated users" ON public.suppliers;

CREATE POLICY "Suppliers insertable by authenticated"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Suppliers updatable by authenticated"
ON public.suppliers FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Suppliers deletable by admin or manager"
ON public.suppliers FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 3. QUOTATIONS: Separar operações
DROP POLICY IF EXISTS "Quotations can be managed by authenticated users" ON public.quotations;

CREATE POLICY "Quotations insertable by authenticated"
ON public.quotations FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Quotations updatable by authenticated"
ON public.quotations FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Quotations deletable by admin or manager"
ON public.quotations FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 4. SUPPLIER_DOCUMENTS: Separar operações
DROP POLICY IF EXISTS "Supplier documents can be managed by authenticated users" ON public.supplier_documents;

CREATE POLICY "Supplier documents insertable by authenticated"
ON public.supplier_documents FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Supplier documents updatable by authenticated"
ON public.supplier_documents FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Supplier documents deletable by admin or manager"
ON public.supplier_documents FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 5. ACCOUNT_CATEGORIES: Restringir escrita a admin
DROP POLICY IF EXISTS "Account categories can be managed by authenticated users" ON public.account_categories;

CREATE POLICY "Account categories manageable by admin"
ON public.account_categories FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. RECURRING_TRANSACTIONS: Separar operações
DROP POLICY IF EXISTS "Recurring transactions manageable by authenticated" ON public.recurring_transactions;

CREATE POLICY "Recurring transactions insertable by authenticated"
ON public.recurring_transactions FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Recurring transactions updatable by authenticated"
ON public.recurring_transactions FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Recurring transactions deletable by admin or manager"
ON public.recurring_transactions FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);
