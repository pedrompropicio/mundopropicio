CREATE UNIQUE INDEX IF NOT EXISTS ux_settlements_office_event_confirmed
ON public.ticket_office_settlements(financial_account_id, event_id)
WHERE status = 'confirmed';