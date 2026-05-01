-- Fix: trigger autolog deve correr AFTER (não BEFORE), senão o FK em
-- sponsorship_pipeline_activities.pipeline_id falha porque a linha-mãe ainda
-- não existe no momento do INSERT.
DROP TRIGGER IF EXISTS trg_sponsorship_pipeline_autolog ON public.sponsorship_pipeline;

CREATE TRIGGER trg_sponsorship_pipeline_autolog
AFTER INSERT OR UPDATE ON public.sponsorship_pipeline
FOR EACH ROW
EXECUTE FUNCTION public.tg_sponsorship_pipeline_autolog();