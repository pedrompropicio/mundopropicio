-- LOCAL ONLY: exact installed FK definitions from the retained Live catalog SELECT snapshot.
-- Bootstrap stubs already supplied these names, so replace them locally before applying candidates.
ALTER TABLE public.event_forecasts DROP CONSTRAINT "event_forecasts_transaction_id_fkey";
ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) DEFERRABLE;
ALTER TABLE public.transaction_offsets DROP CONSTRAINT "transaction_offsets_payable_transaction_id_fkey";
ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_payable_transaction_id_fkey" FOREIGN KEY (payable_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_offsets DROP CONSTRAINT "transaction_offsets_receivable_transaction_id_fkey";
ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_receivable_transaction_id_fkey" FOREIGN KEY (receivable_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_payments DROP CONSTRAINT "transaction_payments_offset_id_fkey";
ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_offset_id_fkey" FOREIGN KEY (offset_id) REFERENCES transaction_offsets(id) ON DELETE RESTRICT;
ALTER TABLE public.transaction_payments DROP CONSTRAINT "transaction_payments_transaction_id_fkey";
ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transactions DROP CONSTRAINT "transactions_forecast_id_fkey";
ALTER TABLE public.transactions ADD CONSTRAINT "transactions_forecast_id_fkey" FOREIGN KEY (forecast_id) REFERENCES event_forecasts(id) ON DELETE SET NULL DEFERRABLE;
