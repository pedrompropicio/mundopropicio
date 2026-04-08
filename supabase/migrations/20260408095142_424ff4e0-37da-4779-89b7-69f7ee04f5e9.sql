
-- New income leaf categories
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '1.1.04', 'Camarotes / Hospitalidade', 'income', 'b0000001-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '1.2.06', 'Naming Rights', 'income', 'b0000002-0000-0000-0000-000000000001', true);

-- Per Diems under Logística (2.2)
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '2.2.05', 'Per Diems / Ajudas de Custo', 'expense', 'b0000005-0000-0000-0000-000000000001', true);

-- New group 2.9 F&B / Bares
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  ('d0290000-0000-0000-0000-000000000001', '2.9', 'F&B / Bares', 'expense', 'a0000002-0000-0000-0000-000000000001', true);

INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '2.9.01', 'Bares - Estrutura e Operação', 'expense', 'd0290000-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '2.9.02', 'Open Bar', 'expense', 'd0290000-0000-0000-0000-000000000001', true);

-- Operação new leaves
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '2.6.09', 'Merchandising Operacional', 'expense', 'b0000009-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '2.6.10', 'Credenciais / Acessórios', 'expense', 'b0000009-0000-0000-0000-000000000001', true);

-- PR / Guest List under Comunicação (3.1) - code 3.1.09 to avoid conflict with existing 3.1.05-3.1.08
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '3.1.09', 'PR / Guest List', 'expense', 'b0000010-0000-0000-0000-000000000001', true);

-- Serviços Terceirizados new leaves
INSERT INTO public.account_categories (id, code, name, type, parent_id, event_required)
VALUES
  (gen_random_uuid(), '4.4.06', 'Gestão de Resíduos', 'expense', 'e0044000-0000-0000-0000-000000000001', true),
  (gen_random_uuid(), '4.4.07', 'Acessibilidade (PMR)', 'expense', 'e0044000-0000-0000-0000-000000000001', true);
