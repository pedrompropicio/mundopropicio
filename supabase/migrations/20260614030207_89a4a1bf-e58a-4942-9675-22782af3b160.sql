-- Dedup de conversões Google por (empresa, ação de conversão, order_id).
-- order_id = lead_capture_id (no caso do produtor de leads) ou transaction_id
-- (vendas, futuro). Permitimos múltiplas linhas com order_id NULL, mas quando
-- há order_id preenchido só pode existir uma linha por trio.
CREATE UNIQUE INDEX IF NOT EXISTS google_conversion_dedup_uidx
  ON crm.google_conversion (company_id, conversion_action_ref, order_id)
  WHERE order_id IS NOT NULL;