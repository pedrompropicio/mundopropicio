BEGIN;
ALTER FUNCTION public.bp_version_linked_tx_count(_event_id uuid)                  SECURITY INVOKER;
ALTER FUNCTION public.list_bp_versions(_event_id uuid)                            SECURITY INVOKER;
ALTER FUNCTION public.list_orphan_transactions_for_event(_event_id uuid)          SECURITY INVOKER;
ALTER FUNCTION public.find_admin_absorbing_events(p_date date, p_company_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.suggest_formalidade(_forecast_id uuid)                      SECURITY INVOKER;
COMMIT;