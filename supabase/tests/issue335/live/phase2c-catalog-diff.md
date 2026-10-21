# #335 fase 2c — diferencial catálogo Live × harness local

Total: 390; iguais: 368; explicadas: 22; DIVERGENTES: 0

| objeto | resultado | nota |
|---|---|---|
| constraint:bank_statement_lines.bank_statement_lines_matched_payment_list_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_lists" |
| constraint:bank_statement_lines.bank_statement_lines_matched_sepa_export_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_list_sepa_exports" |
| constraint:bank_statement_lines.bank_statement_lines_statement_id_fkey | explicada | fixture dependency absent locally: relation "bank_statements" does not exist |
| constraint:event_forecasts.event_forecasts_addback_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:event_forecasts.event_forecasts_cache_config_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_cache_configs" |
| constraint:event_forecasts.event_forecasts_category_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "account_categories" |
| constraint:event_forecasts.event_forecasts_event_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:event_forecasts.event_forecasts_ordering_partner_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_partners" |
| constraint:event_forecasts.event_forecasts_paying_partner_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_partners" |
| constraint:event_forecasts.event_forecasts_version_id_fkey | explicada | fixture dependency absent locally: relation "bp_versions" does not exist |
| constraint:events.events_city_id_fkey | explicada | fixture dependency absent locally: relation "cities" does not exist |
| constraint:events.events_venue_id_fkey | explicada | fixture dependency absent locally: relation "venues" does not exist |
| constraint:profiles.profiles_id_fkey | explicada | fixture dependency absent locally: insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey" |
| constraint:transaction_payments.transaction_payments_payment_list_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_lists" |
| constraint:transaction_payments.transaction_payments_supplier_credit_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "supplier_credits" |
| constraint:transactions.transactions_cache_contract_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "cache_payment_contracts" |
| constraint:transactions.transactions_card_session_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "card_sessions" |
| constraint:transactions.transactions_category_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "account_categories" |
| constraint:transactions.transactions_event_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:transactions.transactions_settlement_id_fkey | explicada | fixture dependency absent locally: relation "ticket_office_settlements" does not exist |
| constraint:transactions.transactions_supplier_credit_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "supplier_credits" |
| constraint:user_roles.user_roles_user_id_fkey | explicada | fixture dependency absent locally: insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey" |
