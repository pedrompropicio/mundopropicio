INSERT INTO public.cities (name, country, state)
SELECT 'Madrid', 'Espanha', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.cities WHERE country = 'Espanha' AND lower(name) = 'madrid' AND state IS NULL
);