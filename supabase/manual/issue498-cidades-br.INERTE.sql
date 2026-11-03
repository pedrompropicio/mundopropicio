-- Issue #498 P3a — cidades BR, opção A. PREPARAÇÃO R2; INERTE, NÃO APLICADO.
-- Data: 2026-11-03. Aplicação só na janela Claude via PROC-promocao e autorização.
-- Esperado: 30 identidades (27 capitais + Campinas/SP, Ribeirão Preto/SP, Uberlândia/MG).
-- INSERT esperado: 30 se vazio; 29 com apenas Fortaleza/CE manual de 02/11/2026;
-- 5 se o seed 20260620221854 estiver completo; segunda execução: 0.
-- Identidade: (country, lower(nome sem acentos), state); sem extensão unaccent,
-- sem alterar cities, sem catálogo paralelo e sem tocar em cidades existentes.
-- Guardar os IDs do RETURNING para um rollback que preserve os pré-existentes.
BEGIN;
LOCK TABLE public.cities IN SHARE ROW EXCLUSIVE MODE;
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
  ('Uberlândia','MG'),
  ('Boa Vista','RR'),
  ('Rio Branco','AC'),
  ('Macapá','AP'),
  ('Palmas','TO'),
  ('Porto Velho','RO')
) AS v(name, state)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cities c
  WHERE c.country = 'Brasil'
    AND translate(lower(normalize(c.name, NFC)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
      = translate(lower(normalize(v.name, NFC)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    AND coalesce(c.state, '') = v.state
)
RETURNING id, name, country, state;
COMMIT;

-- ROLLBACK COMENTADO — preencher APENAS com os UUIDs devolvidos por esta aplicação.
-- Não apagar por nome: Fortaleza/CE e qualquer outra cidade pré-existente ficam intactas.
-- BEGIN;
-- DELETE FROM public.cities WHERE id = ANY(ARRAY[]::uuid[]);
-- COMMIT;
