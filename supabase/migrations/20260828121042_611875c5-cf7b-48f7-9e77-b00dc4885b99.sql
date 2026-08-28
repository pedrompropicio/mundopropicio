ALTER TABLE public.static_pages
  DROP CONSTRAINT static_pages_locale_check;

ALTER TABLE public.static_pages
  ADD CONSTRAINT static_pages_locale_check
  CHECK (locale IN ('pt','en','es'));