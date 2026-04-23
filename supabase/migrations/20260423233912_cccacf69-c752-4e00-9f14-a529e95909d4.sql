
-- event_forecasts (BP)
CREATE INDEX IF NOT EXISTS idx_ef_event_id ON public.event_forecasts (event_id);
CREATE INDEX IF NOT EXISTS idx_ef_category_id ON public.event_forecasts (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ef_transaction_id ON public.event_forecasts (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ef_cache_config_id ON public.event_forecasts (cache_config_id) WHERE cache_config_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ef_event_type_status ON public.event_forecasts (event_id, type, status);

-- transactions
CREATE INDEX IF NOT EXISTS idx_tx_event_id ON public.transactions (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_category_id ON public.transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_supplier_id ON public.transactions (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_account_id ON public.transactions (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_date ON public.transactions (date);
CREATE INDEX IF NOT EXISTS idx_tx_payment_date ON public.transactions (payment_date) WHERE payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_status_type ON public.transactions (status, type);
CREATE INDEX IF NOT EXISTS idx_tx_event_status ON public.transactions (event_id, status) WHERE event_id IS NOT NULL;

-- transaction_documents
CREATE INDEX IF NOT EXISTS idx_td_transaction_id ON public.transaction_documents (transaction_id);

-- ticket_sales
CREATE INDEX IF NOT EXISTS idx_ts_zone_id ON public.ticket_sales (zone_id);
CREATE INDEX IF NOT EXISTS idx_ts_lot_id ON public.ticket_sales (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ts_sale_date ON public.ticket_sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_ts_financial_account_id ON public.ticket_sales (financial_account_id) WHERE financial_account_id IS NOT NULL;

-- event_ticket_lots
CREATE INDEX IF NOT EXISTS idx_etl_zone_id ON public.event_ticket_lots (zone_id);

-- event_ticket_zones
CREATE INDEX IF NOT EXISTS idx_etz_event_id ON public.event_ticket_zones (event_id);
CREATE INDEX IF NOT EXISTS idx_etz_session_id ON public.event_ticket_zones (session_id) WHERE session_id IS NOT NULL;

-- events
CREATE INDEX IF NOT EXISTS idx_events_parent_id ON public.events (parent_event_id) WHERE parent_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (date);
CREATE INDEX IF NOT EXISTS idx_events_city_id ON public.events (city_id) WHERE city_id IS NOT NULL;

-- account_categories
CREATE INDEX IF NOT EXISTS idx_ac_parent_id ON public.account_categories (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ac_type_active ON public.account_categories (type, is_active);

-- user_roles (has_role chamada constantemente via RLS)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);

-- role_permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role);

-- suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers (is_active) WHERE is_active = true;

-- event_dates / event_sessions
CREATE INDEX IF NOT EXISTS idx_event_dates_event_id ON public.event_dates (event_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_id ON public.event_sessions (event_id);

-- event_partners
CREATE INDEX IF NOT EXISTS idx_event_partners_event_id ON public.event_partners (event_id);
CREATE INDEX IF NOT EXISTS idx_event_partners_supplier_id ON public.event_partners (supplier_id);

-- transaction_payments
CREATE INDEX IF NOT EXISTS idx_tx_payments_transaction_id ON public.transaction_payments (transaction_id);

-- payment_list_items
CREATE INDEX IF NOT EXISTS idx_pli_payment_list_id ON public.payment_list_items (payment_list_id);
CREATE INDEX IF NOT EXISTS idx_pli_transaction_id ON public.payment_list_items (transaction_id) WHERE transaction_id IS NOT NULL;

-- ANALYZE para o planner aprender as estatísticas
ANALYZE public.event_forecasts;
ANALYZE public.transactions;
ANALYZE public.transaction_documents;
ANALYZE public.ticket_sales;
ANALYZE public.event_ticket_lots;
ANALYZE public.event_ticket_zones;
ANALYZE public.events;
ANALYZE public.account_categories;
ANALYZE public.user_roles;
ANALYZE public.role_permissions;
