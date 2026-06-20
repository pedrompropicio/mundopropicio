
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS state text NULL;

CREATE INDEX IF NOT EXISTS cities_country_idx ON public.cities(country);
CREATE UNIQUE INDEX IF NOT EXISTS cities_country_name_state_uniq
  ON public.cities(country, lower(name), coalesce(state, ''));

INSERT INTO public.cities (name, country, state)
SELECT v.name, 'Brasil', v.state
FROM (VALUES
  ('Fortaleza','CE'),
  ('São Paulo','SP'),
  ('Rio de Janeiro','RJ'),
  ('Brasília','DF'),
  ('Salvador','BA'),
  ('Recife','PE'),
  ('Belo Horizonte','MG'),
  ('Porto Alegre','RS'),
  ('Curitiba','PR'),
  ('Goiânia','GO'),
  ('Manaus','AM'),
  ('Belém','PA'),
  ('Natal','RN'),
  ('João Pessoa','PB'),
  ('Maceió','AL'),
  ('Aracaju','SE'),
  ('São Luís','MA'),
  ('Teresina','PI'),
  ('Campo Grande','MS'),
  ('Cuiabá','MT'),
  ('Florianópolis','SC'),
  ('Vitória','ES'),
  ('Campinas','SP'),
  ('Ribeirão Preto','SP'),
  ('Uberlândia','MG')
) AS v(name, state)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cities c
  WHERE c.country = 'Brasil'
    AND lower(c.name) = lower(v.name)
    AND coalesce(c.state, '') = v.state
);
