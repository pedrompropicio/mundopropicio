-- Restringe a leitura de transações por papel, dentro da própria empresa.
-- O RESTRICTIVE company_isolation_transactions fica intacto e continua a aplicar-se.
DROP POLICY IF EXISTS "Transactions are viewable by authenticated users" ON public.transactions;

CREATE POLICY "transactions_select_privileged_roles"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);