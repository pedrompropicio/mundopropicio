CREATE OR REPLACE FUNCTION public.prevent_camarim_split_structure_drift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.parent_item_id IS NOT NULL THEN
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.iva_amount IS DISTINCT FROM OLD.iva_amount
       OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
       OR NEW.bp_scope IS DISTINCT FROM OLD.bp_scope
       OR NEW.parent_item_id IS DISTINCT FROM OLD.parent_item_id
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.payment_origin IS DISTINCT FROM OLD.payment_origin
       OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      RAISE EXCEPTION 'Itens divididos não podem alterar valor nem vinculações; use a redivisão do talão-mãe';
    END IF;
  END IF;

  IF OLD.status = 'split' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.iva_amount IS DISTINCT FROM OLD.iva_amount
       OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
       OR NEW.bp_scope IS DISTINCT FROM OLD.bp_scope
       OR NEW.parent_item_id IS DISTINCT FROM OLD.parent_item_id
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.payment_origin IS DISTINCT FROM OLD.payment_origin
       OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      RAISE EXCEPTION 'Talões já divididos não podem ser alterados estruturalmente; use a redivisão';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_camarim_split_structure_drift ON public.camarim_items;
CREATE TRIGGER trg_prevent_camarim_split_structure_drift
BEFORE UPDATE ON public.camarim_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_camarim_split_structure_drift();