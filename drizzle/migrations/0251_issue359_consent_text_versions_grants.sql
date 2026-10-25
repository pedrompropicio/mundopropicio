REVOKE ALL ON public.consent_text_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.consent_text_versions FROM authenticated;