-- Delete audit logs for the forecasts first (FK dependency)
DELETE FROM public.forecast_audit_log
WHERE forecast_id IN (
  SELECT id FROM public.event_forecasts
  WHERE event_id IN (
    '637a2267-77ea-446a-b694-048a0b033fdc',
    '59276604-1426-476c-a624-220ae20b192a',
    '0eef8019-f7e1-4a83-b1e5-1cd1a93e7157'
  )
);

-- Delete all forecasts from the 3 events
DELETE FROM public.event_forecasts
WHERE event_id IN (
  '637a2267-77ea-446a-b694-048a0b033fdc',
  '59276604-1426-476c-a624-220ae20b192a',
  '0eef8019-f7e1-4a83-b1e5-1cd1a93e7157'
);