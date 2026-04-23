-- Cria categoria L3 "Camarim" sob 2.2 Custos Artísticos
INSERT INTO public.account_categories (code, name, type, parent_id, event_required, is_active)
SELECT
  '2.2.05',
  'Camarim',
  'expense',
  p.id,
  true,
  true
FROM public.account_categories p
WHERE p.code = '2.2'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_categories WHERE code = '2.2.05'
  );