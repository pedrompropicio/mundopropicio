
INSERT INTO account_categories (id, code, name, type, parent_id, is_active, event_required)
VALUES (
  '657d8ec9-9d88-4375-992f-a94acc401863',
  '2.6.10',
  'Credenciais / Acessórios',
  'expense',
  'b0000009-0000-0000-0000-000000000001',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;
