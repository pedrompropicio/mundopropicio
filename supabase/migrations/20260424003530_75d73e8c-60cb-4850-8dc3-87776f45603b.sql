-- Bloquear DELETE em sessões já integradas (regra inviolável a nível de BD)
CREATE OR REPLACE FUNCTION public.prevent_delete_integrated_camarim_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'integrated' THEN
    RAISE EXCEPTION 'Não é permitido eliminar uma sessão de camarim já integrada no sistema financeiro';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_integrated_camarim_session ON public.camarim_sessions;
CREATE TRIGGER trg_prevent_delete_integrated_camarim_session
BEFORE DELETE ON public.camarim_sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_integrated_camarim_session();

-- Garantir cascade nos filhos (caso ainda não esteja) — items, fund_moves, session_events, integrations
ALTER TABLE public.camarim_items
  DROP CONSTRAINT IF EXISTS camarim_items_session_id_fkey,
  ADD CONSTRAINT camarim_items_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.camarim_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.camarim_fund_moves
  DROP CONSTRAINT IF EXISTS camarim_fund_moves_session_id_fkey,
  ADD CONSTRAINT camarim_fund_moves_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.camarim_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.camarim_session_events
  DROP CONSTRAINT IF EXISTS camarim_session_events_session_id_fkey,
  ADD CONSTRAINT camarim_session_events_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.camarim_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.camarim_integrations
  DROP CONSTRAINT IF EXISTS camarim_integrations_session_id_fkey,
  ADD CONSTRAINT camarim_integrations_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.camarim_sessions(id) ON DELETE CASCADE;

-- Cascade dos documentos quando o item é eliminado
ALTER TABLE public.camarim_item_documents
  DROP CONSTRAINT IF EXISTS camarim_item_documents_item_id_fkey,
  ADD CONSTRAINT camarim_item_documents_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.camarim_items(id) ON DELETE CASCADE;