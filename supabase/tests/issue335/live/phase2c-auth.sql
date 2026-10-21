-- LOCAL ONLY: installed auth bodies verbatim; fixtures adapt hosted claims, never function bodies.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN CREATE ROLE sandbox_exec NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_sfohvvlqccmmebvjgibx') THEN CREATE ROLE sandbox_exec_sfohvvlqccmmebvjgibx NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA auth,public TO supabase_auth_admin,dashboard_user;
ALTER ROLE service_role BYPASSRLS;
CREATE TABLE IF NOT EXISTS public.bank_line_transactions(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.bank_line_transactions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.bank_line_transactions ADD COLUMN IF NOT EXISTS line_id uuid;
ALTER TABLE public.bank_line_transactions ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE public.bank_line_transactions ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.bank_line_transactions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.bank_statement_lines(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS statement_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS financial_account_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS booking_date date;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS value_date date;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS description text DEFAULT ''::text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS balance_after numeric;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS raw jsonb;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS line_hash text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS status text DEFAULT 'unmatched'::text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_transaction_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_payment_list_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_sepa_export_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS created_transaction_id uuid;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_by text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS matched_at timestamp with time zone;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS bank_ref text;
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS date_divergence jsonb;
CREATE TABLE IF NOT EXISTS public.companies(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS country text DEFAULT 'PT'::text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Lisbon'::text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS favicon_url text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS theme_config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS feature_tickets_v2 boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tickets_config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS public_portal boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS default_budget_mode text DEFAULT 'with_bp'::text;
CREATE TABLE IF NOT EXISTS public.company_features(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS feature_key text;
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS enabled_at timestamp with time zone DEFAULT now();
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS enabled_by uuid;
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.company_features ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.event_forecasts(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS iva_rate integer DEFAULT 23;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS specification text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formula_type text DEFAULT 'fixed'::text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formula_value numeric DEFAULT 0;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS cache_config_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS exclude_from_result boolean DEFAULT false;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS is_transitory boolean DEFAULT false;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS master_forecast_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS attachment_refs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS fx_rate_source text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS original_amount numeric;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS invoice_group_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS is_overhead boolean DEFAULT false;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formalidade bp_formalidade DEFAULT 'estimado'::bp_formalidade;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formalidade_changed_at timestamp with time zone;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formalidade_changed_by uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS historic_overrides jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS is_retroactive_override boolean DEFAULT false;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS ordering_partner_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS paying_partner_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS baseline_amount numeric;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS event_settlement_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS addback_settlement_id uuid;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS addback_reason text;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS vat_non_recoverable boolean DEFAULT false;
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS formula_params jsonb;
CREATE TABLE IF NOT EXISTS public.event_partners(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS supplier_id uuid;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS percentage numeric DEFAULT 0;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS expense_includes_iva boolean;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS loss_percentage numeric;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS can_order boolean DEFAULT false;
ALTER TABLE public.event_partners ADD COLUMN IF NOT EXISTS can_pay boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS public.event_team_members(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS scope text DEFAULT 'full'::text;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.events(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status text DEFAULT 'planning'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget numeric DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tickets_sold integer DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tickets_total integer DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'simple'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS parent_event_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS city_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS pl_mode text DEFAULT 'passive'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS partner_calc_basis text DEFAULT 'net_result'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS last_sales_date date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS absorbs_admin_costs boolean DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS admin_window_end date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS admin_window_start date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS import_template text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketing_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketing_provider text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS operacao_mode text DEFAULT 'planning'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketline_event_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hero_image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_pixel_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_featured boolean DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_visible boolean DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS poster_image_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_pt text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_directions_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_map_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS management_type text DEFAULT 'own'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS vip_coupon_code text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS vip_coupon_discount_label text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS vip_coupon_valid_until timestamp with time zone;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_audience_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_audience_name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ad_destination_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_roas numeric;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS format text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_es text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description_es text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_es text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS budget_mode text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketing_baseline_net numeric;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketing_baseline_at timestamp with time zone;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ab_baseline_net numeric;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ab_baseline_at timestamp with time zone;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS sponsorship_closed_at timestamp with time zone;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ads_allocation_level text DEFAULT 'tour'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ads_match_aliases text[] DEFAULT '{}'::text[];
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cost_expense_source text DEFAULT 'committed'::text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cost_include_overhead boolean DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_nature text;
CREATE TABLE IF NOT EXISTS public.financial_account_access(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.financial_account_access ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
CREATE TABLE IF NOT EXISTS public.financial_accounts(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS type text DEFAULT 'bank'::text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS initial_balance numeric DEFAULT 0;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS balance_visible_to_all boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS card_number text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS skip_balance_check boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS email_contact text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS withholds_revenue boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_accounting boolean DEFAULT true;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS mirror_partner_aporte boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS advance_retention_pct numeric;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS initial_balance_date date;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_restricted boolean DEFAULT false;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_circuit_account boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS public.forecast_audit_log(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS forecast_id uuid;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS changed_by text DEFAULT ''::text;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS field_name text;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS old_value text;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS new_value text;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS observation text;
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.forecast_audit_log ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
CREATE TABLE IF NOT EXISTS public.partner_paid_expenses(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS paid_date date;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS status text DEFAULT 'approved'::text;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS proposed_by uuid;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.partner_paid_expenses ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
CREATE TABLE IF NOT EXISTS public.profiles(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text DEFAULT ''::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_company_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_type text DEFAULT 'user'::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_access_consumed_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_access_token uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_operacao_only boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linked_supplier_id uuid;
CREATE TABLE IF NOT EXISTS public.role_permissions(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS permission text;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.suppliers(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS nif text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS swift_bic text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS trade_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_partner boolean DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS iban_2 text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS iban_3 text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS swift_bic_2 text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS swift_bic_3 text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS doc_locale text DEFAULT 'pt-PT'::text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country text DEFAULT 'PT'::text;
CREATE TABLE IF NOT EXISTS public.system_audit_log(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS changed_by text DEFAULT 'system'::text;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.system_audit_log ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
CREATE TABLE IF NOT EXISTS public.system_invariants(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS severity text DEFAULT 'error'::text;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS reference_count bigint DEFAULT 0;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS reference_updated_by uuid;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS reference_updated_at timestamp with time zone;
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.system_invariants ADD COLUMN IF NOT EXISTS scope text DEFAULT 'global'::text;
CREATE TABLE IF NOT EXISTS public.transaction_audit_log(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS changed_by text DEFAULT 'system'::text;
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS changed_at timestamp with time zone DEFAULT now();
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS field_name text;
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS old_value text;
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS new_value text;
ALTER TABLE public.transaction_audit_log ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
CREATE TABLE IF NOT EXISTS public.transaction_offsets(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS receivable_transaction_id uuid;
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS payable_transaction_id uuid;
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS amount numeric(14,2);
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.transaction_offsets ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.transaction_payments(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'transfer'::text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_entity text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS invoice_ref text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS withholding_amount numeric DEFAULT 0;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS credit_amount numeric DEFAULT 0;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS created_by text DEFAULT 'sistema'::text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'paid'::text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS reversal_kind text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS reversed_by uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS supplier_credit_id uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS closes_transaction boolean DEFAULT false;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS original_amount numeric;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS fx_rate_source text;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS offset_id uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS payment_list_id uuid;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS outside_batch boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS public.transactions(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS iva_rate integer DEFAULT 23;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS date date;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS supplier_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS specification text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_ref text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS pl_override_note text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS parent_transaction_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS split_percentage numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_reimbursement boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reimbursement_to text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS exclude_from_result boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_transitory boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_entity text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'transfer'::text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS split_amount numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS split_mode text DEFAULT 'percentage'::text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS settlement_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fx_rate_source text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS original_amount numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_group_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS declared_withholding_amount numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS declared_withholding_rate numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS iban_override text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_kind text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_by uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS supplier_credit_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS card_session_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ordering_partner_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paying_partner_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS forecast_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_group_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_number integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_total integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_confidential boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS operation_key text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS event_settlement_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS held_by_supplier_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS shared_cost_account_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS shared_cost_counterparty_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transitory_reason text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cache_contract_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cache_role text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cache_root_event_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cache_artist_supplier_id uuid;
CREATE TABLE IF NOT EXISTS public.user_permissions(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS permission text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS granted boolean DEFAULT true;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
CREATE TABLE IF NOT EXISTS public.user_roles(id uuid DEFAULT gen_random_uuid());
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT current_company_id();
UPDATE public.companies SET status='active';
CREATE TABLE IF NOT EXISTS public.partner_event_access(id uuid,user_id uuid,event_id uuid,is_active boolean,can_edit_bp boolean);
UPDATE public.user_roles SET id=gen_random_uuid(),company_id='00000000-0000-0000-0000-000000000001';
INSERT INTO public.profiles(id,company_id,active_company_id) SELECT DISTINCT user_id,company_id,company_id FROM public.user_roles ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,active_company_id=excluded.active_company_id;
DROP FUNCTION IF EXISTS public.is_platform_admin();
DROP FUNCTION IF EXISTS public.is_platform_admin(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid,public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_staff_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission_in(uuid,text,uuid);
INSERT INTO public.companies(id) VALUES('00000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(id,user_id,role,company_id) VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000013','admin','00000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles(id,company_id,active_company_id) VALUES('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002') ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
$function$;
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_company uuid;
  v_is_pa boolean;
  v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT active_company_id, company_id INTO v_active, v_company
    FROM public.profiles WHERE id = v_uid;

  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;

  -- 1) active_company_id válido (platform_admin OU user tem membership lá)
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN
      RETURN v_active;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;

  -- 2) fallback: profiles.company_id se ainda tem membership lá
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles
        WHERE user_id = v_uid AND company_id = v_company) THEN
      RETURN v_company;
    END IF;
  END IF;

  -- 3) fallback: primeira empresa onde tem membership
  RETURN (SELECT ur.company_id FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active'
    ORDER BY ur.id LIMIT 1);
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
        AND (
          _role = 'platform_admin'::app_role
          OR company_id = public.current_company_id()
        )
    )
$function$;
CREATE OR REPLACE FUNCTION public.has_staff_role(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN (
          'admin','platform_admin','manager','editor','viewer','accountant',
          'producer','field_producer','content_manager','marketing_manager'
        )
        AND (ur.role = 'platform_admin'::app_role OR ur.company_id = public.current_company_id())
    )
  );
$function$;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission
         AND company_id = public.current_company_id()
       LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission = _permission
        AND ur.company_id = public.current_company_id()
    )
  )
$function$;
CREATE OR REPLACE FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission AND company_id = _company_id LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       WHERE ur.user_id = _user_id AND rp.permission = _permission AND ur.company_id = _company_id)
  )
$function$;
CREATE OR REPLACE FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pa boolean := public.is_platform_admin(_user_id);
  v_roles text[];
  v_role text;
  v_full boolean;
  v_perms text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  SELECT array_agg(DISTINCT role::text) INTO v_roles
    FROM public.user_roles
   WHERE user_id = _user_id
     AND (company_id = _company_id OR role = 'platform_admin'::app_role);

  SELECT r INTO v_role FROM unnest(coalesce(v_roles, '{}')) r
   ORDER BY CASE r WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
     WHEN 'accountant' THEN 3 WHEN 'marketing_manager' THEN 4 WHEN 'content_manager' THEN 4
     WHEN 'editor' THEN 4 WHEN 'producer' THEN 4 WHEN 'field_producer' THEN 4
     WHEN 'partner' THEN 5 WHEN 'viewer' THEN 6 WHEN 'user' THEN 7 ELSE 99 END, r
   LIMIT 1;

  v_full := v_pa OR 'admin' = ANY(coalesce(v_roles, '{}'));

  WITH base AS (
    SELECT unnest(coalesce(_universe, '{}')) k WHERE v_full
    UNION SELECT permission FROM public.role_permissions WHERE v_pa
    UNION SELECT rp.permission FROM public.role_permissions rp
      WHERE rp.role::text = ANY(coalesce(v_roles, '{}'))
  ),
  ov AS (
    SELECT permission k, bool_and(granted) g FROM public.user_permissions
     WHERE user_id = _user_id AND company_id = _company_id GROUP BY 1
  ),
  eff AS (
    SELECT b.k FROM base b LEFT JOIN ov ON ov.k = b.k WHERE ov.g IS NULL OR ov.g
    UNION SELECT k FROM ov WHERE g
  )
  SELECT array_agg(k ORDER BY k) INTO v_perms FROM eff;

  RETURN jsonb_build_object(
    'role', coalesce(v_role, 'user'),
    'company_id', _company_id,
    'permissions', to_jsonb(coalesce(v_perms, '{}'))
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin()
    OR _row_company_id IS NULL
    OR _row_company_id = public.current_company_id()
$function$;
CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- A identidade do socio e SEMPRE a ligacao explicita (D-ERP63). O antigo
  -- recurso por coincidencia de email foi removido a 14/09/2026: atribuia a
  -- entidade errada a quem partilhasse dominio de email e fazia aparecer
  -- ligacoes que nao existiam. Medido antes de remover: os 8 parceiros tinham
  -- ligacao registada; so dois utilizadores (papel producer, sem acesso de
  -- parceiro) resolviam por email, e nenhuma politica lhes dava nada.
  SELECT p.linked_supplier_id FROM public.profiles p WHERE p.id = p_user_id;
$function$;
CREATE OR REPLACE FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND p_event_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.partner_event_access pea
      WHERE pea.user_id = p_user_id
        AND pea.event_id = p_event_id
        AND pea.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.partner_event_access pea ON pea.event_id = e.parent_event_id
      WHERE e.id = p_event_id
        AND pea.user_id = p_user_id
        AND pea.is_active = true
    )
  );
$function$;
CREATE OR REPLACE FUNCTION public.can_see_confidential(_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin(_user)
      OR public.has_role(_user, 'admin'::app_role)
      OR public.has_permission(_user, 'view_confidential');
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.event_team_members
      WHERE event_id = _event_id AND profile_id = _user_id
        AND role = 'general_producer' AND scope = 'full'
    );
$function$;
ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;
REVOKE ALL ON FUNCTION auth.jwt() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO postgres;
GRANT EXECUTE ON FUNCTION auth.jwt() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.jwt() TO dashboard_user;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
REVOKE ALL ON FUNCTION auth.role() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.role() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.role() TO dashboard_user;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO dashboard_user;
ALTER FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[]) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[]) TO postgres;
GRANT EXECUTE ON FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[]) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.current_company_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.has_permission(_user_id uuid, _permission text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_permission(_user_id uuid, _permission text) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(_user_id uuid, _permission text) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.has_staff_role(_user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_staff_role(_user_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.has_staff_role(_user_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_staff_role(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_role(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_staff_role(_user_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.is_platform_admin(_user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_admin(_user_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(_user_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(_row_company_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.can_see_confidential(_user uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_see_confidential(_user uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(_user uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(_user uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(_user uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(_user uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.user_supplier_id(p_user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.user_supplier_id(p_user_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx,dashboard_user;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(p_user_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);

-- Live table owners, ACL and every policy on the relations used by #335 (catalog SELECT).
ALTER TABLE public.bank_line_transactions OWNER TO postgres;
REVOKE ALL ON public.bank_line_transactions FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_line_transactions TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_line_transactions TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_line_transactions TO service_role;
GRANT INSERT,SELECT ON public.bank_line_transactions TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.bank_line_transactions TO sandbox_exec;
ALTER TABLE public.bank_line_transactions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='bank_line_transactions' LOOP EXECUTE format('DROP POLICY %I ON public.bank_line_transactions',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_bank_line_transactions" ON public.bank_line_transactions AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Bank line transactions manageable by authorized users" ON public.bank_line_transactions AS PERMISSIVE FOR ALL TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text))) WITH CHECK ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text)));
CREATE POLICY "Bank line transactions viewable by authorized users" ON public.bank_line_transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text) OR (EXISTS ( SELECT 1
   FROM (bank_statement_lines bsl
     JOIN financial_account_access faa ON ((faa.account_id = bsl.financial_account_id)))
  WHERE ((bsl.id = bank_line_transactions.line_id) AND (faa.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE public.bank_statement_lines OWNER TO postgres;
REVOKE ALL ON public.bank_statement_lines FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_statement_lines TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_statement_lines TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.bank_statement_lines TO service_role;
GRANT INSERT,SELECT ON public.bank_statement_lines TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.bank_statement_lines TO sandbox_exec;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='bank_statement_lines' LOOP EXECUTE format('DROP POLICY %I ON public.bank_statement_lines',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_bank_statement_lines" ON public.bank_statement_lines AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Bank statement lines manageable by authorized users" ON public.bank_statement_lines AS PERMISSIVE FOR ALL TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text))) WITH CHECK ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text)));
CREATE POLICY "Bank statement lines viewable by authorized users" ON public.bank_statement_lines AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_permission(( SELECT auth.uid() AS uid), 'manage_bank_reconciliation'::text) OR (EXISTS ( SELECT 1
   FROM financial_account_access faa
  WHERE ((faa.account_id = bank_statement_lines.financial_account_id) AND (faa.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE public.companies OWNER TO postgres;
REVOKE ALL ON public.companies FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.companies TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.companies TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.companies TO service_role;
GRANT INSERT,SELECT ON public.companies TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.companies TO sandbox_exec;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='companies' LOOP EXECUTE format('DROP POLICY %I ON public.companies',p.policyname); END LOOP; END $$;
CREATE POLICY "Platform admin manages companies" ON public.companies AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Users see their member companies" ON public.companies AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_platform_admin() OR (id = current_company_id()) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.company_id = companies.id))))));
ALTER TABLE public.company_features OWNER TO postgres;
REVOKE ALL ON public.company_features FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.company_features TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.company_features TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.company_features TO service_role;
GRANT INSERT,SELECT ON public.company_features TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.company_features TO sandbox_exec;
ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='company_features' LOOP EXECUTE format('DROP POLICY %I ON public.company_features',p.policyname); END LOOP; END $$;
CREATE POLICY "company_features_delete_platform_admin" ON public.company_features AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "company_features_insert_platform_admin" ON public.company_features AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "company_features_select_members" ON public.company_features AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR (company_id = current_company_id())));
CREATE POLICY "company_features_update_platform_admin" ON public.company_features AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_platform_admin(( SELECT auth.uid() AS uid)));
ALTER TABLE public.event_forecasts OWNER TO postgres;
REVOKE ALL ON public.event_forecasts FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_forecasts TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_forecasts TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_forecasts TO service_role;
GRANT INSERT,SELECT ON public.event_forecasts TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.event_forecasts TO sandbox_exec;
ALTER TABLE public.event_forecasts ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='event_forecasts' LOOP EXECUTE format('DROP POLICY %I ON public.event_forecasts',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_event_forecasts" ON public.event_forecasts AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Event forecasts insertable by privileged roles" ON public.event_forecasts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Event forecasts deletable by admin or manager" ON public.event_forecasts AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Event forecasts updatable by privileged roles" ON public.event_forecasts AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Staff can manage scenario forecasts" ON public.event_forecasts AS PERMISSIVE FOR ALL TO authenticated USING (((version_id IS NULL) OR (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)))) WITH CHECK (((version_id IS NULL) OR (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role))));
CREATE POLICY "event_forecasts_delete_partner" ON public.event_forecasts AS PERMISSIVE FOR DELETE TO authenticated USING ((has_permission(( SELECT auth.uid() AS uid), 'edit_approved_bp'::text) AND (EXISTS ( SELECT 1
   FROM partner_event_access pea
  WHERE ((pea.user_id = ( SELECT auth.uid() AS uid)) AND (pea.event_id = event_forecasts.event_id) AND (pea.is_active = true) AND (pea.can_edit_bp = true)))) AND (COALESCE(is_overhead, false) = false) AND (COALESCE(exclude_from_result, false) = false) AND (master_forecast_id IS NULL) AND (COALESCE(is_retroactive_override, false) = false)));
CREATE POLICY "event_forecasts_insert_partner" ON public.event_forecasts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_permission(( SELECT auth.uid() AS uid), 'edit_approved_bp'::text) AND (EXISTS ( SELECT 1
   FROM partner_event_access pea
  WHERE ((pea.user_id = ( SELECT auth.uid() AS uid)) AND (pea.event_id = event_forecasts.event_id) AND (pea.is_active = true) AND (pea.can_edit_bp = true)))) AND (company_id = current_company_id()) AND (type = 'expense'::text) AND (COALESCE(is_overhead, false) = false) AND (COALESCE(exclude_from_result, false) = false) AND (master_forecast_id IS NULL) AND (COALESCE(is_retroactive_override, false) = false)));
CREATE POLICY "event_forecasts_select_partner" ON public.event_forecasts AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_event_access(( SELECT auth.uid() AS uid), event_id));
CREATE POLICY "event_forecasts_select_view_bp" ON public.event_forecasts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin() OR ((company_id = current_company_id()) AND has_permission(( SELECT auth.uid() AS uid), 'view_bp'::text))));
CREATE POLICY "event_forecasts_update_partner" ON public.event_forecasts AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_permission(( SELECT auth.uid() AS uid), 'edit_approved_bp'::text) AND (EXISTS ( SELECT 1
   FROM partner_event_access pea
  WHERE ((pea.user_id = ( SELECT auth.uid() AS uid)) AND (pea.event_id = event_forecasts.event_id) AND (pea.is_active = true) AND (pea.can_edit_bp = true)))))) WITH CHECK ((has_permission(( SELECT auth.uid() AS uid), 'edit_approved_bp'::text) AND (EXISTS ( SELECT 1
   FROM partner_event_access pea
  WHERE ((pea.user_id = ( SELECT auth.uid() AS uid)) AND (pea.event_id = event_forecasts.event_id) AND (pea.is_active = true) AND (pea.can_edit_bp = true)))) AND (company_id = current_company_id())));
ALTER TABLE public.event_partners OWNER TO postgres;
REVOKE ALL ON public.event_partners FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_partners TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_partners TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_partners TO service_role;
GRANT INSERT,SELECT ON public.event_partners TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.event_partners TO sandbox_exec;
ALTER TABLE public.event_partners ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='event_partners' LOOP EXECUTE format('DROP POLICY %I ON public.event_partners',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_event_partners" ON public.event_partners AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Event partners deletable by admin or manager" ON public.event_partners AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Event partners insertable by admin or manager" ON public.event_partners AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Event partners updatable by admin or manager" ON public.event_partners AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "event_partners_select_partner" ON public.event_partners AS PERMISSIVE FOR SELECT TO authenticated USING ((user_has_event_access(( SELECT auth.uid() AS uid), event_id) AND (supplier_id IS NOT NULL) AND (supplier_id = user_supplier_id(( SELECT auth.uid() AS uid)))));
CREATE POLICY "event_partners_select_privileged_roles" ON public.event_partners AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.event_team_members OWNER TO postgres;
REVOKE ALL ON public.event_team_members FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_team_members TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_team_members TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.event_team_members TO service_role;
GRANT INSERT,SELECT ON public.event_team_members TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.event_team_members TO sandbox_exec;
ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='event_team_members' LOOP EXECUTE format('DROP POLICY %I ON public.event_team_members',p.policyname); END LOOP; END $$;
CREATE POLICY "ETM — SELECT" ON public.event_team_members AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin(( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), 'manage_operacao_frentes'::text) OR can_manage_event_operacao_full(event_id, ( SELECT auth.uid() AS uid))));
CREATE POLICY "ETM — Write" ON public.event_team_members AS PERMISSIVE FOR ALL TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), 'manage_operacao_frentes'::text) OR can_manage_event_operacao_full(event_id, ( SELECT auth.uid() AS uid)))) WITH CHECK ((is_platform_admin(( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), 'manage_operacao_frentes'::text) OR can_manage_event_operacao_full(event_id, ( SELECT auth.uid() AS uid))));
CREATE POLICY "ETM — tenant isolation" ON public.event_team_members AS RESTRICTIVE FOR ALL TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR (company_id = current_company_id()))) WITH CHECK ((is_platform_admin(( SELECT auth.uid() AS uid)) OR (company_id = current_company_id())));
ALTER TABLE public.events OWNER TO postgres;
REVOKE ALL ON public.events FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.events TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.events TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.events TO service_role;
GRANT INSERT,SELECT ON public.events TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.events TO sandbox_exec;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='events' LOOP EXECUTE format('DROP POLICY %I ON public.events',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_events" ON public.events AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Events deletable by admin only" ON public.events AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "Events insertable by privileged roles" ON public.events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'content_manager'::app_role)));
CREATE POLICY "Events updatable by privileged roles" ON public.events AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'content_manager'::app_role)));
CREATE POLICY "events_select_partner" ON public.events AS PERMISSIVE FOR SELECT TO authenticated USING ((user_has_event_access(( SELECT auth.uid() AS uid), id) OR ((parent_event_id IS NOT NULL) AND user_has_event_access(( SELECT auth.uid() AS uid), parent_event_id))));
CREATE POLICY "events_select_privileged_roles" ON public.events AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.financial_account_access OWNER TO postgres;
REVOKE ALL ON public.financial_account_access FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_account_access TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_account_access TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_account_access TO service_role;
GRANT INSERT,SELECT ON public.financial_account_access TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.financial_account_access TO sandbox_exec;
ALTER TABLE public.financial_account_access ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='financial_account_access' LOOP EXECUTE format('DROP POLICY %I ON public.financial_account_access',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_financial_account_access" ON public.financial_account_access AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Account access manageable by admin" ON public.financial_account_access AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "Account access viewable by own user or privileged" ON public.financial_account_access AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
ALTER TABLE public.financial_accounts OWNER TO postgres;
REVOKE ALL ON public.financial_accounts FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_accounts TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_accounts TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.financial_accounts TO service_role;
GRANT INSERT,SELECT ON public.financial_accounts TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.financial_accounts TO sandbox_exec;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='financial_accounts' LOOP EXECUTE format('DROP POLICY %I ON public.financial_accounts',p.policyname); END LOOP; END $$;
CREATE POLICY "Financial accounts viewable by authorized users" ON public.financial_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR ((company_id = current_company_id()) AND (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR can_see_confidential(( SELECT auth.uid() AS uid)) OR ((COALESCE(is_restricted, false) = false) AND has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)) OR (EXISTS ( SELECT 1
   FROM financial_account_access faa
  WHERE ((faa.account_id = financial_accounts.id) AND (faa.user_id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "company_isolation_financial_accounts" ON public.financial_accounts AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Financial accounts manageable by admin" ON public.financial_accounts AS PERMISSIVE FOR ALL TO authenticated USING ((is_platform_admin(( SELECT auth.uid() AS uid)) OR ((company_id = current_company_id()) AND has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)))) WITH CHECK ((is_platform_admin(( SELECT auth.uid() AS uid)) OR ((company_id = current_company_id()) AND has_role(( SELECT auth.uid() AS uid), 'admin'::app_role))));
ALTER TABLE public.forecast_audit_log OWNER TO postgres;
REVOKE ALL ON public.forecast_audit_log FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.forecast_audit_log TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.forecast_audit_log TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.forecast_audit_log TO service_role;
GRANT INSERT,SELECT ON public.forecast_audit_log TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.forecast_audit_log TO sandbox_exec;
ALTER TABLE public.forecast_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='forecast_audit_log' LOOP EXECUTE format('DROP POLICY %I ON public.forecast_audit_log',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_forecast_audit_log" ON public.forecast_audit_log AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Admins and managers can insert forecast audit logs" ON public.forecast_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "forecast_audit_log_select_privileged_roles" ON public.forecast_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.partner_paid_expenses OWNER TO postgres;
REVOKE ALL ON public.partner_paid_expenses FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.partner_paid_expenses TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.partner_paid_expenses TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.partner_paid_expenses TO service_role;
GRANT INSERT,SELECT ON public.partner_paid_expenses TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.partner_paid_expenses TO sandbox_exec;
ALTER TABLE public.partner_paid_expenses ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='partner_paid_expenses' LOOP EXECUTE format('DROP POLICY %I ON public.partner_paid_expenses',p.policyname); END LOOP; END $$;
CREATE POLICY "Admins and managers can delete partner paid expenses" ON public.partner_paid_expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "company_isolation_partner_paid_expenses" ON public.partner_paid_expenses AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Partner paid expenses viewable by privileged roles" ON public.partner_paid_expenses AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'platform_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'accountant'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role)));
CREATE POLICY "partner_paid_expenses_select_partner" ON public.partner_paid_expenses AS PERMISSIVE FOR SELECT TO authenticated USING ((user_has_event_access(( SELECT auth.uid() AS uid), event_id) AND (EXISTS ( SELECT 1
   FROM event_partners ep
  WHERE ((ep.id = partner_paid_expenses.partner_id) AND (ep.supplier_id = user_supplier_id(( SELECT auth.uid() AS uid))))))));
CREATE POLICY "ppe_delete_editor_own_pending" ON public.partner_paid_expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) AND (status = 'pending_approval'::text) AND (proposed_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "ppe_insert_admin_manager" ON public.partner_paid_expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "ppe_insert_editor_pending" ON public.partner_paid_expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) AND (status = 'pending_approval'::text) AND (proposed_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "ppe_update_admin_manager" ON public.partner_paid_expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
ALTER TABLE public.profiles OWNER TO postgres;
REVOKE ALL ON public.profiles FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.profiles TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.profiles TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.profiles TO service_role;
GRANT INSERT,SELECT ON public.profiles TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.profiles TO sandbox_exec;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' LOOP EXECUTE format('DROP POLICY %I ON public.profiles',p.policyname); END LOOP; END $$;
CREATE POLICY "Profiles visible to self or admins" ON public.profiles AS PERMISSIVE FOR SELECT TO PUBLIC USING (((id = ( SELECT auth.uid() AS uid)) OR is_platform_admin(( SELECT auth.uid() AS uid)) OR (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) AND (company_id = current_company_id()))));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
ALTER TABLE public.role_permissions OWNER TO postgres;
REVOKE ALL ON public.role_permissions FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.role_permissions TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.role_permissions TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.role_permissions TO service_role;
GRANT INSERT,SELECT ON public.role_permissions TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.role_permissions TO sandbox_exec;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='role_permissions' LOOP EXECUTE format('DROP POLICY %I ON public.role_permissions',p.policyname); END LOOP; END $$;
CREATE POLICY "role_permissions_select_own_roles" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = role_permissions.role)))));
CREATE POLICY "Role permissions manageable by admin" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "role_permissions_select_privileged_roles" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.suppliers OWNER TO postgres;
REVOKE ALL ON public.suppliers FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.suppliers TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.suppliers TO service_role;
GRANT INSERT,SELECT ON public.suppliers TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.suppliers TO sandbox_exec;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' LOOP EXECUTE format('DROP POLICY %I ON public.suppliers',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_suppliers" ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Suppliers deletable by admin or manager" ON public.suppliers AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Suppliers insertable by admin, manager or editor" ON public.suppliers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "Suppliers updatable by admin, manager or editor" ON public.suppliers AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "Suppliers viewable by tenant members" ON public.suppliers AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'marketing_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'producer'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'field_producer'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'accountant'::app_role)));
ALTER TABLE public.system_audit_log OWNER TO postgres;
REVOKE ALL ON public.system_audit_log FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_audit_log TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_audit_log TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_audit_log TO service_role;
GRANT INSERT,SELECT ON public.system_audit_log TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.system_audit_log TO sandbox_exec;
ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='system_audit_log' LOOP EXECUTE format('DROP POLICY %I ON public.system_audit_log',p.policyname); END LOOP; END $$;
CREATE POLICY "System audit log viewable by admin or manager" ON public.system_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)) AND ((company_id IS NOT NULL) OR is_platform_admin())));
CREATE POLICY "System audit log insertable by service role" ON public.system_audit_log AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "company_isolation_system_audit_log" ON public.system_audit_log AS RESTRICTIVE FOR ALL TO authenticated USING (row_belongs_to_current_company(company_id)) WITH CHECK (row_belongs_to_current_company(company_id));
CREATE POLICY "System audit log insertable by privileged roles" ON public.system_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
ALTER TABLE public.system_invariants OWNER TO postgres;
REVOKE ALL ON public.system_invariants FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_invariants TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_invariants TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.system_invariants TO service_role;
GRANT INSERT,SELECT ON public.system_invariants TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.system_invariants TO sandbox_exec;
ALTER TABLE public.system_invariants ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='system_invariants' LOOP EXECUTE format('DROP POLICY %I ON public.system_invariants',p.policyname); END LOOP; END $$;
CREATE POLICY "system_invariants_select_admins" ON public.system_invariants AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'platform_admin'::app_role)));
ALTER TABLE public.transaction_audit_log OWNER TO postgres;
REVOKE ALL ON public.transaction_audit_log FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_audit_log TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_audit_log TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_audit_log TO service_role;
GRANT INSERT,SELECT ON public.transaction_audit_log TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.transaction_audit_log TO sandbox_exec;
ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='transaction_audit_log' LOOP EXECUTE format('DROP POLICY %I ON public.transaction_audit_log',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_transaction_audit_log" ON public.transaction_audit_log AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Transaction audit log insertable by privileged roles" ON public.transaction_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "transaction_audit_log_select_privileged_roles" ON public.transaction_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.transaction_offsets OWNER TO postgres;
REVOKE ALL ON public.transaction_offsets FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_offsets TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_offsets TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_offsets TO service_role;
GRANT INSERT,SELECT ON public.transaction_offsets TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.transaction_offsets TO sandbox_exec;
ALTER TABLE public.transaction_offsets ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='transaction_offsets' LOOP EXECUTE format('DROP POLICY %I ON public.transaction_offsets',p.policyname); END LOOP; END $$;
CREATE POLICY "transaction_offsets_select_staff" ON public.transaction_offsets AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
CREATE POLICY "transaction_offsets_insert_privileged" ON public.transaction_offsets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "transaction_offsets_update_privileged" ON public.transaction_offsets AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "transaction_offsets_delete_privileged" ON public.transaction_offsets AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "company_isolation_transaction_offsets" ON public.transaction_offsets AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
ALTER TABLE public.transaction_payments OWNER TO postgres;
REVOKE ALL ON public.transaction_payments FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_payments TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_payments TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_payments TO service_role;
GRANT INSERT,SELECT ON public.transaction_payments TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.transaction_payments TO sandbox_exec;
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='transaction_payments' LOOP EXECUTE format('DROP POLICY %I ON public.transaction_payments',p.policyname); END LOOP; END $$;
CREATE POLICY "Transaction payments insertable by privileged roles" ON public.transaction_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "company_isolation_transaction_payments" ON public.transaction_payments AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Transaction payments deletable by privileged roles" ON public.transaction_payments AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "Transaction payments updatable by privileged roles" ON public.transaction_payments AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "transaction_payments_select_privileged_roles" ON public.transaction_payments AS PERMISSIVE FOR SELECT TO authenticated USING (has_staff_role(( SELECT auth.uid() AS uid)));
ALTER TABLE public.transactions OWNER TO postgres;
REVOKE ALL ON public.transactions FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transactions TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transactions TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transactions TO service_role;
GRANT INSERT,SELECT ON public.transactions TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.transactions TO sandbox_exec;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='transactions' LOOP EXECUTE format('DROP POLICY %I ON public.transactions',p.policyname); END LOOP; END $$;
CREATE POLICY "company_isolation_transactions" ON public.transactions AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Transactions deletable by admin or manager" ON public.transactions AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "Transactions insertable by privileged roles" ON public.transactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "Transactions updatable by privileged roles" ON public.transactions AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
CREATE POLICY "transactions_confidential_guard" ON public.transactions AS RESTRICTIVE FOR SELECT TO authenticated USING ((can_see_confidential(( SELECT auth.uid() AS uid)) OR ((COALESCE(is_confidential, false) = false) AND ((account_id IS NULL) OR (NOT (EXISTS ( SELECT 1
   FROM financial_accounts a
  WHERE ((a.id = transactions.account_id) AND a.is_restricted))))))));
CREATE POLICY "transactions_select_partner" ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated USING (((event_id IS NOT NULL) AND user_has_event_access(( SELECT auth.uid() AS uid), event_id) AND has_permission(( SELECT auth.uid() AS uid), 'view_partner_transactions'::text)));
CREATE POLICY "transactions_select_privileged_roles" ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'platform_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'accountant'::app_role)));
ALTER TABLE public.user_permissions OWNER TO postgres;
REVOKE ALL ON public.user_permissions FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_permissions TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_permissions TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_permissions TO service_role;
GRANT INSERT,SELECT ON public.user_permissions TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.user_permissions TO sandbox_exec;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_permissions' LOOP EXECUTE format('DROP POLICY %I ON public.user_permissions',p.policyname); END LOOP; END $$;
CREATE POLICY "User permissions manageable by admin" ON public.user_permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "User permissions viewable by own user or admin" ON public.user_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "company_isolation_user_permissions" ON public.user_permissions AS RESTRICTIVE FOR ALL TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (company_id = current_company_id()) OR is_platform_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (company_id = current_company_id()) OR is_platform_admin()));
ALTER TABLE public.user_roles OWNER TO postgres;
REVOKE ALL ON public.user_roles FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_roles TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_roles TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_roles TO service_role;
GRANT INSERT,SELECT ON public.user_roles TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT INSERT,SELECT ON public.user_roles TO sandbox_exec;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' LOOP EXECUTE format('DROP POLICY %I ON public.user_roles',p.policyname); END LOOP; END $$;
CREATE POLICY "Only admins can manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "User roles viewable by own user or privileged" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));
CREATE POLICY "company_isolation_user_roles" ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (company_id = current_company_id()) OR is_platform_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (company_id = current_company_id()) OR is_platform_admin()));
ALTER FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._run_invariant_checks_extra() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO postgres;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO sandbox_exec_sfohvvlqccmmebvjgibx;

-- Live CHECK/UNIQUE/PK/FK constraints. Each failure is recorded as a parity gap, never silently skipped.
CREATE TABLE IF NOT EXISTS public.issue335_parity_gaps(object text PRIMARY KEY, reason text);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_line_transactions'::regclass AND conname='bank_line_transactions_line_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_line_transactions ADD CONSTRAINT "bank_line_transactions_line_id_fkey" FOREIGN KEY (line_id) REFERENCES bank_statement_lines(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_line_transactions.bank_line_transactions_line_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_line_transactions'::regclass AND conname='bank_line_transactions_line_id_transaction_id_key') THEN EXECUTE 'ALTER TABLE public.bank_line_transactions ADD CONSTRAINT "bank_line_transactions_line_id_transaction_id_key" UNIQUE (line_id, transaction_id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_line_transactions.bank_line_transactions_line_id_transaction_id_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_line_transactions'::regclass AND conname='bank_line_transactions_pkey') THEN EXECUTE 'ALTER TABLE public.bank_line_transactions ADD CONSTRAINT "bank_line_transactions_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_line_transactions.bank_line_transactions_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_line_transactions'::regclass AND conname='bank_line_transactions_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_line_transactions ADD CONSTRAINT "bank_line_transactions_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_line_transactions.bank_line_transactions_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_created_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_created_transaction_id_fkey" FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_created_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_financial_account_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_financial_account_id_fkey" FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_financial_account_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_hash_uniq') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_hash_uniq" UNIQUE (financial_account_id, line_hash)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_hash_uniq',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_matched_payment_list_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_matched_payment_list_id_fkey" FOREIGN KEY (matched_payment_list_id) REFERENCES payment_lists(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_matched_payment_list_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_matched_sepa_export_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_matched_sepa_export_id_fkey" FOREIGN KEY (matched_sepa_export_id) REFERENCES payment_list_sepa_exports(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_matched_sepa_export_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_matched_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_matched_transaction_id_fkey" FOREIGN KEY (matched_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_matched_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_pkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_statement_id_fkey') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY (statement_id) REFERENCES bank_statements(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_statement_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_lines'::regclass AND conname='bank_statement_lines_status_chk') THEN EXECUTE 'ALTER TABLE public.bank_statement_lines ADD CONSTRAINT "bank_statement_lines_status_chk" CHECK ((status = ANY (ARRAY[''unmatched''::text, ''matched''::text, ''ignored''::text, ''pre_cutoff''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:bank_statement_lines.bank_statement_lines_status_chk',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_default_budget_mode_check') THEN EXECUTE 'ALTER TABLE public.companies ADD CONSTRAINT "companies_default_budget_mode_check" CHECK ((default_budget_mode = ANY (ARRAY[''with_bp''::text, ''without_bp''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:companies.companies_default_budget_mode_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_pkey') THEN EXECUTE 'ALTER TABLE public.companies ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:companies.companies_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_slug_key') THEN EXECUTE 'ALTER TABLE public.companies ADD CONSTRAINT "companies_slug_key" UNIQUE (slug)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:companies.companies_slug_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_status_check') THEN EXECUTE 'ALTER TABLE public.companies ADD CONSTRAINT "companies_status_check" CHECK ((status = ANY (ARRAY[''active''::text, ''suspended''::text, ''trial''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:companies.companies_status_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.company_features'::regclass AND conname='company_features_company_id_feature_key_key') THEN EXECUTE 'ALTER TABLE public.company_features ADD CONSTRAINT "company_features_company_id_feature_key_key" UNIQUE (company_id, feature_key)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:company_features.company_features_company_id_feature_key_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.company_features'::regclass AND conname='company_features_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.company_features ADD CONSTRAINT "company_features_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:company_features.company_features_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.company_features'::regclass AND conname='company_features_enabled_by_fkey') THEN EXECUTE 'ALTER TABLE public.company_features ADD CONSTRAINT "company_features_enabled_by_fkey" FOREIGN KEY (enabled_by) REFERENCES auth.users(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:company_features.company_features_enabled_by_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.company_features'::regclass AND conname='company_features_pkey') THEN EXECUTE 'ALTER TABLE public.company_features ADD CONSTRAINT "company_features_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:company_features.company_features_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_addback_settlement_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_addback_settlement_id_fkey" FOREIGN KEY (addback_settlement_id) REFERENCES event_settlements(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_addback_settlement_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_addback_xor_perimeter') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_addback_xor_perimeter" CHECK (((addback_settlement_id IS NULL) OR (event_settlement_id IS NULL)))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_addback_xor_perimeter',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_cache_config_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_cache_config_id_fkey" FOREIGN KEY (cache_config_id) REFERENCES event_cache_configs(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_cache_config_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_category_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_category_id_fkey" FOREIGN KEY (category_id) REFERENCES account_categories(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_category_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_currency_check') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_currency_check" CHECK ((currency = ANY (ARRAY[''EUR''::text, ''BRL''::text, ''USD''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_currency_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_event_settlement_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_event_settlement_id_fkey" FOREIGN KEY (event_settlement_id) REFERENCES event_settlements(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_event_settlement_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_formalidade_changed_by_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_formalidade_changed_by_fkey" FOREIGN KEY (formalidade_changed_by) REFERENCES profiles(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_formalidade_changed_by_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_master_forecast_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_master_forecast_id_fkey" FOREIGN KEY (master_forecast_id) REFERENCES event_forecasts(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_master_forecast_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_ordering_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_ordering_partner_id_fkey" FOREIGN KEY (ordering_partner_id) REFERENCES event_partners(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_ordering_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_paying_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_paying_partner_id_fkey" FOREIGN KEY (paying_partner_id) REFERENCES event_partners(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_paying_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_pkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) DEFERRABLE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_type_check') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_type_check" CHECK ((type = ANY (ARRAY[''income''::text, ''expense''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_type_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_forecasts'::regclass AND conname='event_forecasts_version_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_forecasts ADD CONSTRAINT "event_forecasts_version_id_fkey" FOREIGN KEY (version_id) REFERENCES bp_versions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_forecasts.event_forecasts_version_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='event_partners_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "event_partners_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.event_partners_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='event_partners_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "event_partners_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.event_partners_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='event_partners_event_id_supplier_id_key') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "event_partners_event_id_supplier_id_key" UNIQUE (event_id, supplier_id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.event_partners_event_id_supplier_id_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='event_partners_pkey') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "event_partners_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.event_partners_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='event_partners_supplier_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "event_partners_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.event_partners_supplier_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_partners'::regclass AND conname='percentage_range') THEN EXECUTE 'ALTER TABLE public.event_partners ADD CONSTRAINT "percentage_range" CHECK (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_partners.percentage_range',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_created_by_fkey') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_created_by_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_event_id_profile_id_role_key') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_event_id_profile_id_role_key" UNIQUE (event_id, profile_id, role)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_event_id_profile_id_role_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_pkey') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_profile_id_fkey') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_profile_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_role_check') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_role_check" CHECK ((role = ANY (ARRAY[''director''::text, ''general_producer''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_role_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.event_team_members'::regclass AND conname='event_team_members_scope_check') THEN EXECUTE 'ALTER TABLE public.event_team_members ADD CONSTRAINT "event_team_members_scope_check" CHECK ((scope = ANY (ARRAY[''full''::text, ''zones''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:event_team_members.event_team_members_scope_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_admin_window_required') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_admin_window_required" CHECK (((NOT absorbs_admin_costs) OR ((admin_window_start IS NOT NULL) AND ((admin_window_end IS NULL) OR (admin_window_start <= admin_window_end)))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_admin_window_required',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_ads_allocation_level_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_ads_allocation_level_check" CHECK ((ads_allocation_level = ANY (ARRAY[''tour''::text, ''cidade''::text, ''externo''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_ads_allocation_level_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_budget_mode_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_budget_mode_check" CHECK (((budget_mode IS NULL) OR (budget_mode = ANY (ARRAY[''with_bp''::text, ''without_bp''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_budget_mode_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_city_id_fkey') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_city_id_fkey" FOREIGN KEY (city_id) REFERENCES cities(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_city_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_cost_expense_source_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_cost_expense_source_check" CHECK ((cost_expense_source = ANY (ARRAY[''realized''::text, ''committed''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_cost_expense_source_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_event_nature_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_event_nature_check" CHECK ((event_nature = ANY (ARRAY[''producao_propria''::text, ''intermediacao''::text, ''coproducao''::text, ''parceiro_local''::text, ''temporada''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_event_nature_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_management_type_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_management_type_check" CHECK ((management_type = ANY (ARRAY[''own''::text, ''partner_managed''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_management_type_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_operacao_mode_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_operacao_mode_check" CHECK ((operacao_mode = ANY (ARRAY[''planning''::text, ''montagem''::text, ''evento''::text, ''post''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_operacao_mode_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_parent_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_parent_event_id_fkey" FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_parent_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_pkey') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_status_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_status_check" CHECK ((status = ANY (ARRAY[''planning''::text, ''active''::text, ''completed''::text, ''cancelled''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_status_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_ticketing_provider_check') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_ticketing_provider_check" CHECK (((ticketing_provider IS NULL) OR (ticketing_provider = ANY (ARRAY[''ticketline''::text, ''blueticket''::text, ''bol''::text, ''see_tickets''::text, ''fnac_tickets''::text, ''eventbrite''::text, ''ingresse''::text, ''sympla''::text, ''other''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_ticketing_provider_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.events'::regclass AND conname='events_venue_id_fkey') THEN EXECUTE 'ALTER TABLE public.events ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:events.events_venue_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_account_access'::regclass AND conname='financial_account_access_account_id_fkey') THEN EXECUTE 'ALTER TABLE public.financial_account_access ADD CONSTRAINT "financial_account_access_account_id_fkey" FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_account_access.financial_account_access_account_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_account_access'::regclass AND conname='financial_account_access_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.financial_account_access ADD CONSTRAINT "financial_account_access_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_account_access.financial_account_access_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_account_access'::regclass AND conname='financial_account_access_pkey') THEN EXECUTE 'ALTER TABLE public.financial_account_access ADD CONSTRAINT "financial_account_access_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_account_access.financial_account_access_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_account_access'::regclass AND conname='financial_account_access_user_id_account_id_key') THEN EXECUTE 'ALTER TABLE public.financial_account_access ADD CONSTRAINT "financial_account_access_user_id_account_id_key" UNIQUE (user_id, account_id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_account_access.financial_account_access_user_id_account_id_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_accounts'::regclass AND conname='financial_accounts_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.financial_accounts ADD CONSTRAINT "financial_accounts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_accounts.financial_accounts_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_accounts'::regclass AND conname='financial_accounts_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.financial_accounts ADD CONSTRAINT "financial_accounts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES event_partners(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_accounts.financial_accounts_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_accounts'::regclass AND conname='financial_accounts_pkey') THEN EXECUTE 'ALTER TABLE public.financial_accounts ADD CONSTRAINT "financial_accounts_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:financial_accounts.financial_accounts_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.forecast_audit_log'::regclass AND conname='forecast_audit_log_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.forecast_audit_log ADD CONSTRAINT "forecast_audit_log_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:forecast_audit_log.forecast_audit_log_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.forecast_audit_log'::regclass AND conname='forecast_audit_log_forecast_id_fkey') THEN EXECUTE 'ALTER TABLE public.forecast_audit_log ADD CONSTRAINT "forecast_audit_log_forecast_id_fkey" FOREIGN KEY (forecast_id) REFERENCES event_forecasts(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:forecast_audit_log.forecast_audit_log_forecast_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.forecast_audit_log'::regclass AND conname='forecast_audit_log_pkey') THEN EXECUTE 'ALTER TABLE public.forecast_audit_log ADD CONSTRAINT "forecast_audit_log_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:forecast_audit_log.forecast_audit_log_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES event_partners(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_pkey') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_status_check') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_status_check" CHECK ((status = ANY (ARRAY[''approved''::text, ''pending_approval''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_status_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_paid_expenses'::regclass AND conname='partner_paid_expenses_transaction_id_key') THEN EXECUTE 'ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT "partner_paid_expenses_transaction_id_key" UNIQUE (transaction_id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:partner_paid_expenses.partner_paid_expenses_transaction_id_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_active_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_active_company_id_fkey" FOREIGN KEY (active_company_id) REFERENCES companies(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_active_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_first_access_token_key') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_first_access_token_key" UNIQUE (first_access_token)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_first_access_token_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_id_fkey') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_linked_supplier_id_fkey') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_linked_supplier_id_fkey" FOREIGN KEY (linked_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_linked_supplier_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_pkey') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_profile_type_check') THEN EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT "profiles_profile_type_check" CHECK ((profile_type = ANY (ARRAY[''user''::text, ''field_staff''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:profiles.profiles_profile_type_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.role_permissions'::regclass AND conname='role_permissions_pkey') THEN EXECUTE 'ALTER TABLE public.role_permissions ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:role_permissions.role_permissions_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.role_permissions'::regclass AND conname='role_permissions_role_permission_key') THEN EXECUTE 'ALTER TABLE public.role_permissions ADD CONSTRAINT "role_permissions_role_permission_key" UNIQUE (role, permission)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:role_permissions.role_permissions_role_permission_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.suppliers ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:suppliers.suppliers_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_country_iso2') THEN EXECUTE 'ALTER TABLE public.suppliers ADD CONSTRAINT "suppliers_country_iso2" CHECK ((country ~ ''^[A-Z]{2}$''::text))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:suppliers.suppliers_country_iso2',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_doc_locale_check') THEN EXECUTE 'ALTER TABLE public.suppliers ADD CONSTRAINT "suppliers_doc_locale_check" CHECK ((doc_locale = ANY (ARRAY[''pt-PT''::text, ''pt-BR''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:suppliers.suppliers_doc_locale_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_pkey') THEN EXECUTE 'ALTER TABLE public.suppliers ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:suppliers.suppliers_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_audit_log'::regclass AND conname='system_audit_log_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.system_audit_log ADD CONSTRAINT "system_audit_log_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_audit_log.system_audit_log_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_audit_log'::regclass AND conname='system_audit_log_pkey') THEN EXECUTE 'ALTER TABLE public.system_audit_log ADD CONSTRAINT "system_audit_log_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_audit_log.system_audit_log_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_invariants'::regclass AND conname='system_invariants_pkey') THEN EXECUTE 'ALTER TABLE public.system_invariants ADD CONSTRAINT "system_invariants_pkey" PRIMARY KEY (name)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_invariants.system_invariants_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_invariants'::regclass AND conname='system_invariants_reference_updated_by_fkey') THEN EXECUTE 'ALTER TABLE public.system_invariants ADD CONSTRAINT "system_invariants_reference_updated_by_fkey" FOREIGN KEY (reference_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_invariants.system_invariants_reference_updated_by_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_invariants'::regclass AND conname='system_invariants_scope_check') THEN EXECUTE 'ALTER TABLE public.system_invariants ADD CONSTRAINT "system_invariants_scope_check" CHECK ((scope = ANY (ARRAY[''empresa''::text, ''global''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_invariants.system_invariants_scope_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.system_invariants'::regclass AND conname='system_invariants_severity_check') THEN EXECUTE 'ALTER TABLE public.system_invariants ADD CONSTRAINT "system_invariants_severity_check" CHECK ((severity = ANY (ARRAY[''error''::text, ''warn''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:system_invariants.system_invariants_severity_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_audit_log'::regclass AND conname='transaction_audit_log_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_audit_log ADD CONSTRAINT "transaction_audit_log_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_audit_log.transaction_audit_log_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_audit_log'::regclass AND conname='transaction_audit_log_pkey') THEN EXECUTE 'ALTER TABLE public.transaction_audit_log ADD CONSTRAINT "transaction_audit_log_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_audit_log.transaction_audit_log_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_audit_log'::regclass AND conname='transaction_audit_log_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_audit_log ADD CONSTRAINT "transaction_audit_log_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_audit_log.transaction_audit_log_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_amount_check') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_amount_check" CHECK ((amount > (0)::numeric))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_amount_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_pair_unique') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_pair_unique" UNIQUE (receivable_transaction_id, payable_transaction_id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_pair_unique',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_payable_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_payable_transaction_id_fkey" FOREIGN KEY (payable_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_payable_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_pkey') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_offsets'::regclass AND conname='transaction_offsets_receivable_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_offsets ADD CONSTRAINT "transaction_offsets_receivable_transaction_id_fkey" FOREIGN KEY (receivable_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_offsets.transaction_offsets_receivable_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_account_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_account_id_fkey" FOREIGN KEY (account_id) REFERENCES financial_accounts(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_account_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_fx_required') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_fx_required" CHECK (((currency = ''EUR''::text) OR ((original_amount IS NOT NULL) AND (fx_rate IS NOT NULL))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_fx_required',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_offset_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_offset_id_fkey" FOREIGN KEY (offset_id) REFERENCES transaction_offsets(id) ON DELETE RESTRICT'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_offset_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_payment_list_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_payment_list_id_fkey" FOREIGN KEY (payment_list_id) REFERENCES payment_lists(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_payment_list_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_payment_method_check') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_payment_method_check" CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY[''transfer''::text, ''service_payment''::text, ''direct_debit''::text, ''state_payment''::text, ''compensation''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_payment_method_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_pkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_reversal_kind_check') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_reversal_kind_check" CHECK (((reversal_kind IS NULL) OR (reversal_kind = ANY (ARRAY[''cash_refund''::text, ''supplier_credit''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_reversal_kind_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_status_check') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_status_check" CHECK ((status = ANY (ARRAY[''planned''::text, ''paid''::text, ''cancelled''::text, ''reversed''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_status_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_supplier_credit_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_supplier_credit_id_fkey" FOREIGN KEY (supplier_credit_id) REFERENCES supplier_credits(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_supplier_credit_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transaction_payments'::regclass AND conname='transaction_payments_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.transaction_payments ADD CONSTRAINT "transaction_payments_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transaction_payments.transaction_payments_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_account_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY (account_id) REFERENCES financial_accounts(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_account_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_cache_contract_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_cache_contract_id_fkey" FOREIGN KEY (cache_contract_id) REFERENCES cache_payment_contracts(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_cache_contract_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_cache_role_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_cache_role_check" CHECK (((cache_role IS NULL) OR (cache_role = ANY (ARRAY[''artist_balance''::text, ''withholding''::text, ''advance''::text])))) NOT VALID'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_cache_role_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_card_session_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_card_session_id_fkey" FOREIGN KEY (card_session_id) REFERENCES card_sessions(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_card_session_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_category_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES account_categories(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_category_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_currency_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_currency_check" CHECK ((currency = ANY (ARRAY[''EUR''::text, ''BRL''::text, ''USD''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_currency_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_declared_withholding_nonneg') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_declared_withholding_nonneg" CHECK ((((declared_withholding_rate IS NULL) OR (declared_withholding_rate >= (0)::numeric)) AND ((declared_withholding_amount IS NULL) OR (declared_withholding_amount >= (0)::numeric))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_declared_withholding_nonneg',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_event_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_event_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_event_settlement_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_event_settlement_id_fkey" FOREIGN KEY (event_settlement_id) REFERENCES event_settlements(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_event_settlement_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_forecast_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_forecast_id_fkey" FOREIGN KEY (forecast_id) REFERENCES event_forecasts(id) ON DELETE SET NULL DEFERRABLE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_forecast_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_held_by_only_compensation_income') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_held_by_only_compensation_income" CHECK (((held_by_supplier_id IS NULL) OR ((payment_method = ''compensation''::text) AND (type = ''income''::text))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_held_by_only_compensation_income',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_held_by_supplier_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_held_by_supplier_id_fkey" FOREIGN KEY (held_by_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_held_by_supplier_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_iva_rate_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_iva_rate_check" CHECK ((iva_rate = ANY (ARRAY[23, 13, 6, 0, 21, 10, 4])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_iva_rate_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_operation_key_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_operation_key_check" CHECK (((operation_key IS NULL) OR (operation_key ~ ''^[A-Z0-9]+(-[A-Z0-9]+)+$''::text)))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_operation_key_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_ordering_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_ordering_partner_id_fkey" FOREIGN KEY (ordering_partner_id) REFERENCES event_partners(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_ordering_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_parent_transaction_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_parent_transaction_id_fkey" FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_parent_transaction_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_paying_partner_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_paying_partner_id_fkey" FOREIGN KEY (paying_partner_id) REFERENCES event_partners(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_paying_partner_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_payment_method_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_payment_method_check" CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY[''transfer''::text, ''service_payment''::text, ''direct_debit''::text, ''state_payment''::text, ''compensation''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_payment_method_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_pkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_reversal_kind_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_reversal_kind_check" CHECK (((reversal_kind IS NULL) OR (reversal_kind = ANY (ARRAY[''cash_refund''::text, ''supplier_credit''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_reversal_kind_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_service_payment_requires_mb') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_service_payment_requires_mb" CHECK (((payment_method <> ''service_payment''::text) OR ((payment_entity ~ ''^\d{5}$''::text) AND (payment_reference ~ ''^\d{9}$''::text)))) NOT VALID'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_service_payment_requires_mb',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_settlement_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_settlement_id_fkey" FOREIGN KEY (settlement_id) REFERENCES ticket_office_settlements(id) ON DELETE SET NULL DEFERRABLE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_settlement_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_shared_cost_account_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_shared_cost_account_id_fkey" FOREIGN KEY (shared_cost_account_id) REFERENCES financial_accounts(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_shared_cost_account_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_shared_cost_counterparty_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_shared_cost_counterparty_id_fkey" FOREIGN KEY (shared_cost_counterparty_id) REFERENCES suppliers(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_shared_cost_counterparty_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_status_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_status_check" CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''paid''::text, ''overdue''::text, ''partially_paid''::text, ''reversed''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_status_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_supplier_credit_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_supplier_credit_id_fkey" FOREIGN KEY (supplier_credit_id) REFERENCES supplier_credits(id) ON DELETE SET NULL'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_supplier_credit_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_supplier_id_fkey') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_supplier_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_transitory_reason_domain') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_transitory_reason_domain" CHECK (((transitory_reason IS NULL) OR (transitory_reason = ANY (ARRAY[''partner_advance''::text, ''repasse''::text, ''caucao''::text, ''emprestimo_socio''::text, ''carga_cartao''::text, ''aporte_socio''::text, ''entrada_a_repassar''::text, ''devolucao_socio''::text]))))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_transitory_reason_domain',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_transitory_reason_required') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_transitory_reason_required" CHECK (((NOT is_transitory) OR (transitory_reason IS NOT NULL)))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_transitory_reason_required',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_type_check') THEN EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT "transactions_type_check" CHECK ((type = ANY (ARRAY[''income''::text, ''expense''::text])))'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:transactions.transactions_type_check',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_permissions'::regclass AND conname='user_permissions_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.user_permissions ADD CONSTRAINT "user_permissions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_permissions.user_permissions_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_permissions'::regclass AND conname='user_permissions_pkey') THEN EXECUTE 'ALTER TABLE public.user_permissions ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_permissions.user_permissions_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_permissions'::regclass AND conname='user_permissions_user_company_permission_key') THEN EXECUTE 'ALTER TABLE public.user_permissions ADD CONSTRAINT "user_permissions_user_company_permission_key" UNIQUE (user_id, company_id, permission)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_permissions.user_permissions_user_company_permission_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_permissions'::regclass AND conname='user_permissions_user_id_fkey') THEN EXECUTE 'ALTER TABLE public.user_permissions ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_permissions.user_permissions_user_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND conname='user_roles_company_id_fkey') THEN EXECUTE 'ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_roles.user_roles_company_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND conname='user_roles_pkey') THEN EXECUTE 'ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_roles.user_roles_pkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND conname='user_roles_user_company_role_key') THEN EXECUTE 'ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_user_company_role_key" UNIQUE (user_id, company_id, role)'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_roles.user_roles_user_company_role_key',SQLERRM) ON CONFLICT DO NOTHING; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND conname='user_roles_user_id_fkey') THEN EXECUTE 'ALTER TABLE public.user_roles ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'; END IF; EXCEPTION WHEN OTHERS THEN INSERT INTO public.issue335_parity_gaps VALUES('constraint:user_roles.user_roles_user_id_fkey',SQLERRM) ON CONFLICT DO NOTHING; END $$;
GRANT MAINTAIN ON public.bank_line_transactions TO anon;
GRANT MAINTAIN ON public.bank_line_transactions TO authenticated;
GRANT MAINTAIN ON public.bank_line_transactions TO service_role;
GRANT MAINTAIN ON public.bank_statement_lines TO anon;
GRANT MAINTAIN ON public.bank_statement_lines TO authenticated;
GRANT MAINTAIN ON public.bank_statement_lines TO service_role;
GRANT MAINTAIN ON public.companies TO anon;
GRANT MAINTAIN ON public.companies TO authenticated;
GRANT MAINTAIN ON public.companies TO service_role;
GRANT MAINTAIN ON public.company_features TO anon;
GRANT MAINTAIN ON public.company_features TO authenticated;
GRANT MAINTAIN ON public.company_features TO service_role;
GRANT MAINTAIN ON public.event_forecasts TO anon;
GRANT MAINTAIN ON public.event_forecasts TO authenticated;
GRANT MAINTAIN ON public.event_forecasts TO service_role;
GRANT MAINTAIN ON public.event_partners TO anon;
GRANT MAINTAIN ON public.event_partners TO authenticated;
GRANT MAINTAIN ON public.event_partners TO service_role;
GRANT MAINTAIN ON public.event_team_members TO anon;
GRANT MAINTAIN ON public.event_team_members TO authenticated;
GRANT MAINTAIN ON public.event_team_members TO service_role;
GRANT MAINTAIN ON public.events TO anon;
GRANT MAINTAIN ON public.events TO authenticated;
GRANT MAINTAIN ON public.events TO service_role;
GRANT MAINTAIN ON public.financial_account_access TO anon;
GRANT MAINTAIN ON public.financial_account_access TO authenticated;
GRANT MAINTAIN ON public.financial_account_access TO service_role;
GRANT MAINTAIN ON public.financial_accounts TO anon;
GRANT MAINTAIN ON public.financial_accounts TO authenticated;
GRANT MAINTAIN ON public.financial_accounts TO service_role;
GRANT MAINTAIN ON public.forecast_audit_log TO anon;
GRANT MAINTAIN ON public.forecast_audit_log TO authenticated;
GRANT MAINTAIN ON public.forecast_audit_log TO service_role;
GRANT MAINTAIN ON public.partner_paid_expenses TO anon;
GRANT MAINTAIN ON public.partner_paid_expenses TO authenticated;
GRANT MAINTAIN ON public.partner_paid_expenses TO service_role;
GRANT MAINTAIN ON public.profiles TO anon;
GRANT MAINTAIN ON public.profiles TO authenticated;
GRANT MAINTAIN ON public.profiles TO service_role;
GRANT MAINTAIN ON public.role_permissions TO anon;
GRANT MAINTAIN ON public.role_permissions TO authenticated;
GRANT MAINTAIN ON public.role_permissions TO service_role;
GRANT MAINTAIN ON public.suppliers TO authenticated;
GRANT MAINTAIN ON public.suppliers TO service_role;
GRANT MAINTAIN ON public.system_audit_log TO anon;
GRANT MAINTAIN ON public.system_audit_log TO authenticated;
GRANT MAINTAIN ON public.system_audit_log TO service_role;
GRANT MAINTAIN ON public.system_invariants TO anon;
GRANT MAINTAIN ON public.system_invariants TO authenticated;
GRANT MAINTAIN ON public.system_invariants TO service_role;
GRANT MAINTAIN ON public.transaction_audit_log TO anon;
GRANT MAINTAIN ON public.transaction_audit_log TO authenticated;
GRANT MAINTAIN ON public.transaction_audit_log TO service_role;
GRANT MAINTAIN ON public.transaction_offsets TO anon;
GRANT MAINTAIN ON public.transaction_offsets TO authenticated;
GRANT MAINTAIN ON public.transaction_offsets TO service_role;
GRANT MAINTAIN ON public.transaction_payments TO anon;
GRANT MAINTAIN ON public.transaction_payments TO authenticated;
GRANT MAINTAIN ON public.transaction_payments TO service_role;
GRANT MAINTAIN ON public.transactions TO anon;
GRANT MAINTAIN ON public.transactions TO authenticated;
GRANT MAINTAIN ON public.transactions TO service_role;
GRANT MAINTAIN ON public.user_permissions TO anon;
GRANT MAINTAIN ON public.user_permissions TO authenticated;
GRANT MAINTAIN ON public.user_permissions TO service_role;
GRANT MAINTAIN ON public.user_roles TO anon;
GRANT MAINTAIN ON public.user_roles TO authenticated;
GRANT MAINTAIN ON public.user_roles TO service_role;

-- Live role_permissions configuration rows relevant to transaction approval (catalog/config SELECT, no financial data).
INSERT INTO public.role_permissions(role,permission) SELECT v.r::public.app_role,v.p FROM (VALUES('admin','approve_transactions'),('manager','approve_transactions')) v(r,p) WHERE NOT EXISTS(SELECT 1 FROM public.role_permissions x WHERE x.role::text=v.r AND x.permission=v.p);
ALTER TABLE public.partner_event_access ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT public.current_company_id();
ALTER TABLE public.partner_event_access OWNER TO postgres;
REVOKE ALL ON public.partner_event_access FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.partner_event_access TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.partner_event_access TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.partner_event_access TO service_role;
GRANT SELECT,INSERT ON public.partner_event_access TO sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT SELECT,INSERT ON public.partner_event_access TO sandbox_exec;
ALTER TABLE public.partner_event_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation_partner_event_access" ON public.partner_event_access AS RESTRICTIVE FOR ALL TO authenticated USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
CREATE POLICY "Partner access manageable by admin" ON public.partner_event_access AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE POLICY "Partner access viewable by own user or admin" ON public.partner_event_access AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)));

-- Live ACL of shared helpers used by the core.
REVOKE ALL ON FUNCTION public._derive_paid_amount(uuid),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._derive_paid_amount(uuid),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid) TO service_role,sandbox_exec_sfohvvlqccmmebvjgibx;
