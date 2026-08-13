-- Substituir política de DELETE existente por uma que exige status='new'
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='standalone_invoices' AND cmd='DELETE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.standalone_invoices', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "standalone_invoices_delete_new_owner_or_admin"
ON public.standalone_invoices
FOR DELETE
TO authenticated
USING (
  status = 'new'
  AND row_belongs_to_current_company(company_id)
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'platform_admin')
  )
);

-- Reforço: trigger impede DELETE de faturas processadas em qualquer caminho
CREATE OR REPLACE FUNCTION public.prevent_delete_processed_standalone_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'new' THEN
    RAISE EXCEPTION 'Fatura avulsa processada não pode ser apagada. Reabre para "nova" primeiro.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_processed_standalone_invoice ON public.standalone_invoices;
CREATE TRIGGER trg_prevent_delete_processed_standalone_invoice
BEFORE DELETE ON public.standalone_invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_processed_standalone_invoice();

-- Storage: permitir apagar o ficheiro a admin/platform_admin, manager, editor (dono do upload é validado na app)
DROP POLICY IF EXISTS "standalone_invoices_bucket_delete" ON storage.objects;
CREATE POLICY "standalone_invoices_bucket_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'standalone-invoices'
  AND (storage.foldername(name))[1] = current_company_id()::text
  AND (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'platform_admin')
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'editor')
  )
);