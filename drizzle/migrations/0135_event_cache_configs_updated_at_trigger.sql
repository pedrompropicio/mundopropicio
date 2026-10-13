DROP TRIGGER IF EXISTS update_event_cache_configs_updated_at ON public.event_cache_configs;
CREATE TRIGGER update_event_cache_configs_updated_at
BEFORE UPDATE ON public.event_cache_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();