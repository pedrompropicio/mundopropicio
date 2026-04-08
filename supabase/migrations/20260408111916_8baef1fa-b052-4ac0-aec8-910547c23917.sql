
-- Terminology adjustments
UPDATE public.account_categories SET name = 'Sanitários / WC' WHERE code = '2.4.03';
UPDATE public.account_categories SET name = 'Aluguer / Renda' WHERE code = '10.7.02.01';

-- International tour categories
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required) VALUES
  (gen_random_uuid(), '2.2.06', 'Vistos e Imigração', 'expense', 'b0000005-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '2.2.07', 'Frete Internacional / Cargo', 'expense', 'b0000005-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '2.2.08', 'Alfândega / Despacho Aduaneiro', 'expense', 'b0000005-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '2.6.11', 'Tradução / Intérpretes', 'expense', 'b0000009-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '4.1.05', 'Seguro de Cancelamento Internacional', 'expense', 'e0041000-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '4.1.06', 'Seguro de Equipamento em Trânsito', 'expense', 'e0041000-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '4.3.03', 'Impostos Locais / Withholding Tax', 'expense', 'e0043000-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '1.2.07', 'Agenciamento / Booking Fees', 'income', 'b0000002-0000-0000-0000-000000000001', true);
