DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','event_forecasts','event_cache_configs','event_cache_deductions',
    'event_cache_tiers','event_cache_city_settlements',
    'camarim_sessions','camarim_items','camarim_fund_moves',
    'card_sessions','card_session_items','card_session_loads',
    'bank_statement_lines','payment_lists','payment_list_items'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;