ALTER TABLE public.backup_runs DROP CONSTRAINT backup_runs_status_check;
ALTER TABLE public.backup_runs ADD CONSTRAINT backup_runs_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text, 'superseded'::text]));