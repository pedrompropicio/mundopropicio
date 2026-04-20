-- Rollback cirúrgico: remove as 73 transações órfãs criadas pelo botão "Gerar Transações"
-- no evento Master "Maiara e Maraisa" (71) + sub Porto (1) + sub Lisboa (1) em 2026-04-19/20.
-- O restore via UI já desvinculou os event_forecasts (transaction_id = NULL).

-- 1) Limpar dependências (segurança extra)
DELETE FROM public.transaction_payments
WHERE transaction_id IN (
  SELECT id FROM public.transactions
  WHERE event_id IN (
    '5160f0ef-f5c5-46cd-aeda-57309bc0e9cb',
    'b9aa07cf-2459-4c27-93f3-71f8036defb7',
    'f2b628bf-1c1f-4507-8efa-d5aa9328cd2a'
  )
  AND created_at > '2026-04-19 00:00:00+00'
  AND status = 'approved'
);

DELETE FROM public.transaction_documents
WHERE transaction_id IN (
  SELECT id FROM public.transactions
  WHERE event_id IN (
    '5160f0ef-f5c5-46cd-aeda-57309bc0e9cb',
    'b9aa07cf-2459-4c27-93f3-71f8036defb7',
    'f2b628bf-1c1f-4507-8efa-d5aa9328cd2a'
  )
  AND created_at > '2026-04-19 00:00:00+00'
  AND status = 'approved'
);

DELETE FROM public.transaction_audit_log
WHERE transaction_id IN (
  SELECT id FROM public.transactions
  WHERE event_id IN (
    '5160f0ef-f5c5-46cd-aeda-57309bc0e9cb',
    'b9aa07cf-2459-4c27-93f3-71f8036defb7',
    'f2b628bf-1c1f-4507-8efa-d5aa9328cd2a'
  )
  AND created_at > '2026-04-19 00:00:00+00'
  AND status = 'approved'
);

-- 2) Garantir que nenhum forecast continua vinculado
UPDATE public.event_forecasts
SET transaction_id = NULL
WHERE transaction_id IN (
  SELECT id FROM public.transactions
  WHERE event_id IN (
    '5160f0ef-f5c5-46cd-aeda-57309bc0e9cb',
    'b9aa07cf-2459-4c27-93f3-71f8036defb7',
    'f2b628bf-1c1f-4507-8efa-d5aa9328cd2a'
  )
  AND created_at > '2026-04-19 00:00:00+00'
  AND status = 'approved'
);

-- 3) Eliminar as 73 transações órfãs
DELETE FROM public.transactions
WHERE event_id IN (
  '5160f0ef-f5c5-46cd-aeda-57309bc0e9cb',
  'b9aa07cf-2459-4c27-93f3-71f8036defb7',
  'f2b628bf-1c1f-4507-8efa-d5aa9328cd2a'
)
AND created_at > '2026-04-19 00:00:00+00'
AND status = 'approved';