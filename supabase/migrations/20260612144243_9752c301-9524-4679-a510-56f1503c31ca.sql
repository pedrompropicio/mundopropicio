DELETE FROM public.transaction_audit_log
WHERE id IN (
  'e5d598b7-8865-415f-953e-aec12fdd5ad4',
  '702df566-401a-420d-8038-60e21ce7c2c8'
)
AND transaction_id = '6c2d7745-97b7-426c-8dd7-f98635006b95'
AND field_name = 'Eliminação';