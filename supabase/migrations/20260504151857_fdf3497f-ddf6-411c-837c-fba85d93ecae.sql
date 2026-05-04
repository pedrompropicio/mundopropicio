WITH parents AS (
  SELECT ac.id AS parent_id, ac.company_id
  FROM public.account_categories ac
  WHERE ac.code = '10.4'
), new_rows AS (
  SELECT * FROM (VALUES
    ('10.4.06', 'Deslocações e Transportes (Equipa)'),
    ('10.4.07', 'Alimentação de Equipa'),
    ('10.4.08', 'Medicina do Trabalho / Serviços Médicos')
  ) AS v(code, name)
)
INSERT INTO public.account_categories
  (id, code, name, type, parent_id, company_id, event_required, allocate_to_active_event)
SELECT gen_random_uuid(), n.code, n.name, 'expense', p.parent_id, p.company_id, false, false
FROM new_rows n
CROSS JOIN parents p
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_categories x
  WHERE x.code = n.code AND x.company_id = p.company_id
);