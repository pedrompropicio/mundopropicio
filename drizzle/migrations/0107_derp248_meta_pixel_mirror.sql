-- D-ERP248: events.meta_pixel_id (lida pelo portal/CAPI) espelha-se em event_trackers (lida pelo deploy).
CREATE OR REPLACE FUNCTION public.events_meta_pixel_to_trackers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.meta_pixel_id IS NOT DISTINCT FROM OLD.meta_pixel_id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.meta_pixel_id IS NOT NULL THEN
    DELETE FROM public.event_trackers WHERE event_id = NEW.id AND platform = 'meta' AND tracker_id = btrim(OLD.meta_pixel_id);
  END IF;
  IF NEW.meta_pixel_id IS NOT NULL AND btrim(NEW.meta_pixel_id) <> '' AND NEW.company_id IS NOT NULL THEN
    INSERT INTO public.event_trackers (company_id, event_id, platform, tracker_id, tracker_metadata)
    VALUES (NEW.company_id, NEW.id, 'meta', btrim(NEW.meta_pixel_id), jsonb_build_object('custom_event_type','PURCHASE','origem','events.meta_pixel_id'))
    ON CONFLICT (event_id, platform, tracker_id) DO UPDATE SET updated_at = now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_events_meta_pixel_to_trackers AFTER INSERT OR UPDATE OF meta_pixel_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_meta_pixel_to_trackers();