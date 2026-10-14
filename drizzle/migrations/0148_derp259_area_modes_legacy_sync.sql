-- Ecrã antigo (areas/access_level) continua a funcionar: se só esses mudaram, area_modes é recalculado.
CREATE OR REPLACE FUNCTION public._artist_user_access_sync_modes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.area_modes IS NULL OR NEW.area_modes = '{}'::jsonb
     OR (TG_OP = 'UPDATE' AND NEW.area_modes IS NOT DISTINCT FROM OLD.area_modes
         AND (NEW.areas IS DISTINCT FROM OLD.areas OR NEW.access_level IS DISTINCT FROM OLD.access_level)) THEN
    SELECT coalesce(jsonb_object_agg(ar, CASE WHEN NEW.access_level='traffic_manager' AND ar='traffic' THEN 'edit' ELSE 'view' END), '{}'::jsonb)
      INTO NEW.area_modes
      FROM (SELECT DISTINCT unnest(NEW.areas || CASE WHEN NEW.access_level='traffic_manager' THEN ARRAY['traffic'] ELSE ARRAY[]::text[] END) ar) s;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(NEW.area_modes) e
             WHERE e.key <> ALL(ARRAY['overview','channels','traffic','financial','reports','songs','content'])
                OR e.value NOT IN ('view','edit')) THEN
    RAISE EXCEPTION 'area_modes inválido';
  END IF;
  NEW.areas := ARRAY(SELECT jsonb_object_keys(NEW.area_modes));
  NEW.access_level := CASE WHEN NEW.area_modes->>'traffic' = 'edit' THEN 'traffic_manager' ELSE 'viewer' END;
  RETURN NEW;
END $$;