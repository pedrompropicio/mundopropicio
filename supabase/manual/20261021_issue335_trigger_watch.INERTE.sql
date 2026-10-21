-- INERTE / LOCAL ONLY. Additional candidate; separate Pedro Sim required.
-- Allowlist: Live SELECT pg_trigger names captured 2026-10-21 22:43 UTC + #335 guards.
-- Detects unlisted USER triggers, not hostile owner replacement of allowlisted bodies.
-- DDL owner is the trusted computing base: can replace this watcher too.
-- Standalone read invariant; NO existing function/trigger or registry is modified.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public.issue335_trigger_watch()') IS NOT NULL THEN
  RAISE EXCEPTION 'trigger_watch_exists_requires_review'; END IF;
END $$;
CREATE FUNCTION public.issue335_trigger_watch()
RETURNS TABLE(name text,current_count bigint,reference_count bigint,conforme boolean,sample jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH allowed(table_name,trigger_name) AS (VALUES
 ('bank_line_transactions','issue335_guard'),
 ('bank_line_transactions','trg_set_company_id'),
 ('companies','audit_companies_changes'),
 ('companies','seed_sponsorship_segments_after_company'),
 ('companies','trg_companies_updated_at'),
 ('event_settlements','prevent_delete_event_settlement_with_lines'),
 ('event_settlements','trg_guard_sealed_event_settlement'),
 ('event_settlements','trg_set_company_id'),
 ('event_settlements','update_event_settlements_updated_at'),
 ('events','enforce_event_close_blockers'),
 ('events','notify_event_phase_changed'),
 ('events','trg_admin_windows_contiguous'),
 ('events','trg_auto_create_initial_bp_version'),
 ('events','trg_auto_create_retroactive_split_snapshots'),
 ('events','trg_enforce_event_reopen_permission'),
 ('events','trg_events_meta_pixel_to_trackers'),
 ('events','trg_prevent_split_absorbs_admin'),
 ('events','trg_set_company_id'),
 ('events','trg_snapshot_bp_versions_to_trash'),
 ('events','trg_validate_event_admin_absorption'),
 ('events','update_events_updated_at'),
 ('financial_accounts','audit_financial_accounts_changes'),
 ('financial_accounts','trg_set_company_id'),
 ('suppliers','audit_suppliers_changes'),
 ('suppliers','trg_set_company_id'),
 ('suppliers','update_suppliers_updated_at'),
 ('transaction_offset_groups','issue335_guard'),
 ('transaction_offset_items','issue335_guard'),
 ('transaction_offsets','issue335_guard'),
 ('transaction_offsets','trg_set_company_id'),
 ('transaction_offsets','trg_validate_transaction_offset'),
 ('transaction_payments','enforce_payment_date_not_future'),
 ('transaction_payments','issue335_guard'),
 ('transaction_payments','trg_apply_transaction_offsets'),
 ('transaction_payments','trg_clear_reversal_on_repay'),
 ('transaction_payments','trg_enforce_payment_list_batch_channel'),
 ('transaction_payments','trg_set_company_id'),
 ('transaction_payments','trg_sync_paid_amount_from_payments'),
 ('transaction_payments','trg_validate_installments_total'),
 ('transaction_payments','update_transaction_payments_updated_at'),
 ('transaction_payments','zz_camarim_session_leg_follows_bank'),
 ('transactions','enforce_paid_payment_date'),
 ('transactions','enforce_transaction_approval_permission'),
 ('transactions','issue335_guard'),
 ('transactions','trg_card_load_on_out_delete'),
 ('transactions','trg_card_load_on_out_paid'),
 ('transactions','trg_coala_capture_category_change'),
 ('transactions','trg_enforce_admin_window_event'),
 ('transactions','trg_enforce_held_revenue_is_paid'),
 ('transactions','trg_enforce_tx_forecast_same_event'),
 ('transactions','trg_enforce_tx_paid_requires_account'),
 ('transactions','trg_force_confidential_restricted_account'),
 ('transactions','trg_force_exclude_result_shared_cost'),
 ('transactions','trg_force_no_account_on_compensation'),
 ('transactions','trg_force_transitory_capital'),
 ('transactions','trg_realign_tx_category_from_forecast'),
 ('transactions','trg_reimbursement_propagate_payment'),
 ('transactions','trg_reimbursement_revert_on_tx_delete'),
 ('transactions','trg_set_company_id'),
 ('transactions','trg_sync_partner_aporte_mirror'),
 ('transactions','trg_sync_partner_aporte_mirror_del'),
 ('transactions','trg_sync_shared_cost_mirror'),
 ('transactions','trg_sync_shared_cost_mirror_del'),
 ('transactions','trg_sync_tx_forecast_to_anchor'),
 ('transactions','trg_unlink_forecasts_on_tx_event_change'),
 ('transactions','trg_validate_paid_amount_not_exceeds_gross'),
 ('transactions','update_transactions_updated_at'),
 ('transactions','validate_transaction_event_settlement'),
 ('transactions','zz_audit_transactions_change'),
 ('transactions','zz_guard_paid_amount_vs_payments'),
 ('transactions','zz_materialize_paid_amount_payment'),
 ('transactions','zz_rederive_paid_amount_on_amount_change')
 ), observed AS (
 SELECT c.relname::text table_name,t.tgname::text trigger_name,t.tgenabled::text enabled,
        fn.nspname::text function_schema,p.proname::text function_name
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace fn ON fn.oid=p.pronamespace
 WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN (
 'bank_line_transactions','companies','event_settlements','events','financial_accounts','suppliers','transaction_offset_groups','transaction_offset_items','transaction_offsets','transaction_payments','transactions')
 ), bad AS (SELECT o.* FROM observed o WHERE NOT EXISTS
 (SELECT 1 FROM allowed a WHERE a.table_name=o.table_name AND a.trigger_name=o.trigger_name))
 SELECT 'encontro_trigger_nao_permitido'::text,(SELECT count(*) FROM bad),0::bigint,
 NOT EXISTS(SELECT 1 FROM bad),
 coalesce((SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('allowed',NOT EXISTS
 (SELECT 1 FROM bad b WHERE b.table_name=o.table_name AND b.trigger_name=o.trigger_name))
 ORDER BY o.table_name,o.trigger_name) FROM observed o),'[]'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.issue335_trigger_watch() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_trigger_watch() TO service_role;
COMMIT;
