CREATE OR REPLACE FUNCTION public.enforce_cache_config_master_or_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_parent_name text;
  v_children text;
BEGIN
  SELECT parent_event_id INTO v_parent FROM public.events WHERE id = NEW.event_id;

  IF v_parent IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.event_cache_configs WHERE event_id = v_parent AND id <> NEW.id) THEN
      SELECT name INTO v_parent_name FROM public.events WHERE id = v_parent;
      RAISE EXCEPTION 'O cachê deste artista já está configurado no Master %', v_parent_name
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT string_agg(DISTINCT e.name, ', ' ORDER BY e.name) INTO v_children
      FROM public.event_cache_configs c
      JOIN public.events e ON e.id = c.event_id
     WHERE e.parent_event_id = NEW.event_id AND c.id <> NEW.id;
    IF v_children IS NOT NULL THEN
      RAISE EXCEPTION 'O cachê já está configurado nos subeventos %; apaga-os antes de configurar no Master.', v_children
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_cache_config_master_or_children() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_cache_config_master_or_children ON public.event_cache_configs;
CREATE TRIGGER trg_enforce_cache_config_master_or_children
BEFORE INSERT OR UPDATE OF event_id ON public.event_cache_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_cache_config_master_or_children();