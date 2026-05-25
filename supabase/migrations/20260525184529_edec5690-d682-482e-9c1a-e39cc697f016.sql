-- Apagar duplicados das parcelas Hotel Londres
-- Mantém: 3426454f-1126-4092-b068-80b58f1e1cff (2/3) e b0b0b827-f33d-47d8-8f2b-1d42c0ca1868 (3/3)
DELETE FROM public.transactions
WHERE id IN (
  'f999a486-249b-4cc8-9573-289bb8123426',
  'db10eb26-2484-41ad-b3c4-c38bc4eb65cf',
  '73539523-221d-404e-a098-3b772b3fb3ad',
  'f91c6877-459c-4339-84b3-57b1852aeaab'
);