SET lock_timeout = '5s';
REVOKE ALL ON public.ticketline_crosscheck_runs FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticketline_crosscheck_runs FROM authenticated;