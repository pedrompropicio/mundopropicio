ALTER TABLE public.event_ticket_office_advances
  ADD CONSTRAINT event_ticket_office_advances_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT,
  ADD CONSTRAINT event_ticket_office_advances_financial_account_id_fkey FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT event_ticket_office_advances_target_account_id_fkey FOREIGN KEY (target_account_id) REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT event_ticket_office_advances_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.ticket_office_settlements(id) ON DELETE RESTRICT,
  ADD CONSTRAINT event_ticket_office_advances_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;
NOTIFY pgrst, 'reload schema';