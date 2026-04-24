-- 1) Permitir INSERT em camarim_items para qualquer utilizador com permissão camarim_team
--    (mantendo as políticas existentes para admin/manager e dono da sessão).
DROP POLICY IF EXISTS "Camarim items insert by team permission" ON public.camarim_items;
CREATE POLICY "Camarim items insert by team permission"
ON public.camarim_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open','in_review')
  )
);

-- Permitir UPDATE para o autor mesmo que não seja dono da sessão (dentro da janela editável)
DROP POLICY IF EXISTS "Camarim items update own by team" ON public.camarim_items;
CREATE POLICY "Camarim items update own by team"
ON public.camarim_items
FOR UPDATE
TO authenticated
USING (
  status = ANY (ARRAY['draft','submitted','pending_review'])
  AND created_by = auth.uid()
  AND public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open','in_review')
  )
)
WITH CHECK (
  status = ANY (ARRAY['draft','submitted','pending_review'])
  AND created_by = auth.uid()
);

-- 2) Deduplicação: índice único parcial para evitar a mesma despesa lançada 2x
--    Identificador natural: sessão + fornecedor + nº documento + total (apenas quando todos existem).
CREATE UNIQUE INDEX IF NOT EXISTS camarim_items_dedup_idx
ON public.camarim_items (session_id, lower(supplier_name_raw), document_number, total_amount)
WHERE supplier_name_raw IS NOT NULL
  AND document_number IS NOT NULL
  AND total_amount IS NOT NULL
  AND status <> 'rejected';