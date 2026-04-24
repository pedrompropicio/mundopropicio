-- Bloquear DELETE de filhos individuais de um talão dividido
-- Só permite eliminar via cascade (apagando o pai)

CREATE OR REPLACE FUNCTION public.prevent_camarim_split_child_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_still_exists boolean;
BEGIN
  -- Só nos interessa quando estamos a apagar uma linha-filha
  IF OLD.parent_item_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Se o pai ainda existe na BD neste momento, é uma tentativa de apagar
  -- a filha isoladamente. Se não existe, é cascade do DELETE do pai → permitir.
  SELECT EXISTS (
    SELECT 1 FROM public.camarim_items WHERE id = OLD.parent_item_id
  ) INTO parent_still_exists;

  IF parent_still_exists THEN
    RAISE EXCEPTION 'Não é possível eliminar uma linha-filha de um talão dividido isoladamente. Use "Redividir" no talão-mãe para ajustar a divisão, ou elimine o talão-mãe (apaga todas as linhas).';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_camarim_split_child_delete ON public.camarim_items;
CREATE TRIGGER trg_prevent_camarim_split_child_delete
BEFORE DELETE ON public.camarim_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_camarim_split_child_delete();