-- #333 fase12f — eventos sintéticos 1..9 (LOCAL): bilheteira atribuída, 1000 € de vendas (total_value + quantity×unit_price), 1 despesa 100 € + IVA 23 %.
DO $s$ DECLARE n int; BEGIN
  FOR n IN 1..9 LOOP
    INSERT INTO public.events(id, name, date, event_nature, company_id) VALUES (('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'Evento ' || n, '2026-10-09', 'producao_propria', '22222222-2222-2222-2222-222222222222');
    INSERT INTO public.event_ticket_office_assignments(event_id, financial_account_id, company_id) VALUES (('e0000000-0000-4000-8000-00000000000' || n)::uuid, '0f000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222');
    INSERT INTO public.event_ticket_zones(id, event_id, name, company_id) VALUES (('a0000000-0000-4000-8000-00000000000' || n)::uuid, ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'Plateia', '22222222-2222-2222-2222-222222222222');
    INSERT INTO public.ticket_sales(zone_id, quantity, unit_price, total_value, financial_account_id, company_id) VALUES
      (('a0000000-0000-4000-8000-00000000000' || n)::uuid, 10, 50, 500, '0f000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222'),
      (('a0000000-0000-4000-8000-00000000000' || n)::uuid, 10, 50, NULL, '0f000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222');
    INSERT INTO public.transactions(id, event_id, type, category_id, description, amount, iva_rate, date, status, company_id) VALUES
      (('d0000000-0000-4000-8000-00000000000' || n)::uuid, ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'expense', 'c0000000-0000-4000-8000-000000000001', 'Som', 100, 23, '2026-10-09', 'pending', '22222222-2222-2222-2222-222222222222');
  END LOOP;
END $s$;
