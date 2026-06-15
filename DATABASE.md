# DATABASE.md — Esquema da Base de Dados

> 90 tabelas em PostgreSQL (Supabase). Todas com RLS habilitado. Multi-tenant via `company_id` + `current_company_id()` + RLS RESTRICTIVE `company_isolation_*`.

Convenções:
- PK: `id uuid default gen_random_uuid()` salvo nota.
- `company_id uuid NOT NULL default current_company_id()` em todas as tabelas multi-tenant.
- Timestamps: `created_at`, `updated_at` (`now()` default).
- Soft-delete: tabela `trash` (30d).

---

## 1. Tabelas core

### 1.1 `companies`
Empresa-cliente (multi-tenant root).
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| slug | text NN | único |
| display_name | text NN | nome de exibição |
| legal_name | text NN | razão social |
| tax_id | text | NIF/CNPJ |
| country | text NN | default 'PT' |
| currency | text NN | default 'EUR' |
| timezone | text NN | default 'Europe/Lisbon' |
| logo_url, favicon_url | text | branding |
| theme_config | jsonb | cores |
| address | jsonb | |
| contact_email | text | |
| status | text NN | active/suspended |
| created_at, updated_at | timestamptz | |

### 1.2 `profiles`
Mapeia `auth.users` → empresa.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | = auth.users.id |
| full_name | text NN | |
| email | text | |
| company_id | uuid NN | empresa atribuída |
| active_company_id | uuid | só PA, override |

### 1.3 `user_roles`
| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid NN | |
| role | app_role enum | platform_admin/admin/manager/editor/viewer/accountant/partner |
| company_id | uuid NN | |

### 1.4 `user_permissions` / `role_permissions`
Permissões granulares (texto livre, ex: `manage_events`, `camarim_team`).

### 1.5 `company_invitations`
Convites com token, expira 7d.

---

## 2. Plano de Contas

### 2.1 `account_categories`
Hierarquia L1>L2>L3.
| Campo | Tipo | Notas |
|---|---|---|
| code | text NN | |
| name | text NN | |
| type | text NN | income/expense/transfer |
| parent_id | uuid | self-FK |
| is_active | boolean NN | |
| event_required | boolean NN | true se obriga vínculo a evento |
| allocate_to_active_event | boolean NN | |

---

## 3. Eventos

### 3.1 `events`
| Campo | Tipo | Notas |
|---|---|---|
| name | text NN | |
| date | date NN | |
| location | text | |
| status | text NN | planning/confirmed/active/completed |
| event_type | text NN | simple/tour_master/tour_split |
| parent_event_id | uuid | self-FK (split→master) |
| city_id, venue_id | uuid | FKs |
| budget | numeric NN | |
| tickets_total, tickets_sold | integer NN | |
| pl_mode | text NN | passive/active |
| partner_calc_basis | text NN | net_result/gross_revenue |
| absorbs_admin_costs | boolean NN | |
| admin_window_start/end | date | |
| last_sales_date | date | |

### 3.2 `event_dates`, `event_sessions`
Datas e sessões (multi-sessão).

### 3.3 `event_ticket_zones`
| zone | total_capacity | session_id | version_id |

### 3.4 `event_ticket_lots`
| Campo | Tipo | Notas |
|---|---|---|
| zone_id | uuid NN | |
| name | text NN | |
| lot_number | integer NN | |
| price | numeric NN | |
| quantity | integer NN | |
| iva_rate | int NN | default 6 |
| lot_type | text NN | regular/promo |
| lot_kind | text NN | simple/combo |
| is_combo | boolean NN | |
| applies_to_days | int NN | default 1 |
| consumes_zone_ids | uuid[] | zonas extras consumidas |
| combo_benefits, combo_description | text | |

**Validação**: soma `quantity` por zona ≤ `total_capacity`.

### 3.5 `ticket_sales`
Vendas reais (manuais ou importadas).
| sale_date, sale_date_to, zone_id, lot_id, quantity, unit_price, total_value, source, financial_account_id, import_batch_id |

### 3.6 `event_courtesies`
Courtesias por zone+date+scenario.

### 3.7 `event_simulator_*`
- `event_simulator_config` — defaults A&B, sponsor, curva, IVA bilhetes
- `event_simulator_inputs` — projeções por zona+dia
- `event_simulator_zone_config` — overrides por zona
- `event_simulator_cost_lines` — linhas Forecast/BE/Real
- `event_simulator_sales_curve_buckets` — curva por dias-before
- `event_simulator_pax_benchmarks` — benchmarks de mercado

### 3.8 `event_forecasts` (BP)
| Campo | Tipo | Notas |
|---|---|---|
| event_id | uuid NN | |
| description | text NN | |
| amount | numeric NN | NET |
| iva_rate | int NN | default 23 |
| type | text NN | income/expense |
| category_id | uuid | FK account_categories (L3) |
| status | text NN | draft/approved/rejected |
| approved_at, approved_by | | |
| transaction_id | uuid | back-link 1ª parcela |
| formalidade | bp_formalidade enum | estimado/cotacao/negociado/fechado |
| master_forecast_id | uuid | rateio Master |
| is_overhead | boolean NN | |
| is_transitory, exclude_from_result | boolean NN | |
| invoice_group_id | uuid | |
| currency | text NN | default 'EUR' |
| original_amount, fx_rate, fx_rate_source | | multi-currency |
| version_id | uuid | snapshot BP |
| attachment_refs | jsonb | links externos |
| historic_overrides | jsonb | retroactive |
| is_retroactive_override | boolean NN | |
| cache_config_id | uuid | quando vem de cache |
| formula_value, formula_type | | fixed/formula |
| specification | text | |

### 3.9 `event_forecast_partners`, `event_forecast_formalidade_log`
Many-to-many partners + auditoria de mudanças formalidade.

### 3.10 `bp_versions` + `bp_version_audit_log`
Snapshots BP, cenários paralelos (`is_pinned_scenario`), `state` (draft/active/archived/superseded).
| snapshot_payload | jsonb | full snapshot |
| scenario_label, scenario_assumptions | | cenários |
| cascaded_from_version_id | | Master→Splits |

### 3.11 `bp_orphan_attachments`
Links externos órfãos para resolver.

### 3.12 `event_partners` / `event_partner_extras` / `partner_paid_expenses` / `partner_advance_expenses` / `partner_event_access`
| `event_partners`: supplier_id (parceiro), percentage, loss_percentage, expense_includes_iva |

### 3.13 `event_cache_*`
- `event_cache_configs` — artista, tipo (fixed/tier/percentage/MG), basis (net/gross), withholding
- `event_cache_tiers` — % por threshold
- `event_cache_extras` — extras Master/cidade
- `event_cache_payments` — pagamentos (com transação)
- `event_cache_deductions` — categorias deduzíveis
- `event_cache_city_settlements` — fecho por cidade (turnê)

### 3.14 `event_closing_costs`, `event_implementations`
Custos de fecho + implantação de eventos passados.

### 3.15 `event_ab_config` / `event_ab_zones`
Config A&B por evento + zonas (per-capita, repasse, open_bar/food).

### 3.16 `event_ticket_office_assignments` / `event_ticket_office_advances`
Atribuição de bilheteira a evento + adiantamentos.

---

## 4. Transações & Pagamentos

### 4.1 `transactions`
| Campo | Tipo | Notas |
|---|---|---|
| date | date NN | |
| description | text NN | |
| amount | numeric NN | NET |
| iva_rate | int NN | |
| type | text NN | income/expense |
| status | text NN | pending/approved/paid/rejected |
| due_date, payment_date | date | |
| paid_amount | numeric NN | |
| account_id | uuid | financial_account |
| category_id, supplier_id, event_id | uuid | |
| payment_method | text NN | transfer/card/cash/etc |
| payment_reference, payment_entity | text | PT entity/ref |
| invoice_ref, invoice_group_id | | grouping multi-IVA |
| parent_transaction_id | uuid | rateios físicos |
| split_mode, split_amount, split_percentage | | rateio |
| settlement_id | uuid | ticket office settlement |
| is_transitory, exclude_from_result, is_hidden | boolean NN | |
| is_reimbursement, reimbursement_to | | |
| declared_withholding_rate, declared_withholding_amount | | IRS |
| currency, original_amount, fx_rate, fx_rate_source | | multi-currency |
| pl_override_note, specification | text | |

### 4.2 `transaction_payments`
Parcelas individuais (com edição/reversão).

### 4.3 `transaction_documents`
Anexos (`is_accounting` flag, `doc_type`, `file_url`, `ref://` para externos).

### 4.4 `transaction_audit_log`, `forecast_audit_log`
Audit por campo.

### 4.5 `payment_lists` / `payment_list_items`
| status: draft / pending_approval / approved / paid |

### 4.6 `recurring_transactions`
Templates (frequency, day_of_month, next_due_date).

### 4.7 `reimbursement_notes` / `reimbursement_note_items`
Notas de reembolso de funcionários.

### 4.8 `quotations`
Cotações por evento+fornecedor.

---

## 5. Fornecedores

### 5.1 `suppliers`
| name, trade_name, nif, contact, email, phone, address, iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3, payment_terms, category, is_partner, is_active, notes |

### 5.2 `supplier_documents`
Docs (NIF, contratos, etc.) — bucket privado.

### 5.3 `supplier_credits` / `supplier_credit_usages`
Créditos com fornecedor (limite + usagem).

---

## 6. Bilheteiras (Ticket Offices)

### 6.1 `financial_accounts`
| Campo | Tipo | Notas |
|---|---|---|
| name | text NN | |
| type | text NN | bank/card/cash/ticket_office |
| initial_balance | numeric NN | |
| iban, card_number | | |
| balance_visible_to_all | boolean NN | |
| skip_balance_check | boolean NN | aceita negativo |
| withholds_revenue | boolean NN | retém receita |
| is_hidden | boolean NN | esconde de seletores |
| is_active | boolean NN | |
| contact_name, email_contact, phone | | |

### 6.2 `financial_account_access`
Mapeia user → account (visibilidade granular).

### 6.3 `ticket_office_settlements`
| gross_revenue, total_deductions, net_calculated, net_adjusted, net_transferred |
| transfer_account_id, transfer_transaction_id |
| venue_retained_amount, venue_retained_payment_id, venue_retained_invoice_id |
| venue_invoice_remainder_* |
| status: draft/closed/reversed |

### 6.4 `ticket_import_logs`
Logs de imports (Ticketline/Fever/Coala) com `import_batch_id` para rollback.

---

## 7. Camarim

### 7.1 `camarim_sessions`
| title, mode (single_event/tour), status (open/integrated), budget_amount, advance_total, spent_total, settlement_balance, settlement_type, settlement_transaction_id, integration_summary, integration_transaction_ids[], opened_at, closed_at, integrated_at, master_event_id, responsible_profile_id |

### 7.2 `camarim_session_events`
Many-to-many sessão↔eventos (turnê).

### 7.3 `camarim_items`
| type (expense/income), total_amount, base_amount, iva_amount, currency |
| document_type, document_number, document_date, supplier_name_raw, supplier_id |
| service_description, category_id, event_id, financial_account_id |
| payment_origin (caixa sócio/empresa/etc), bp_scope (local_city/master_overhead) |
| has_document, approved_without_document(+reason) |
| status (new/approved/pending) |
| ocr_raw_payload, ocr_confidence (gemini) |
| integration_mode (none/transaction), transaction_id, bp_forecast_id |

### 7.4 `camarim_item_documents`, `camarim_item_reviews`, `camarim_fund_moves`, `camarim_integrations`
Anexos, revisões, movimentos de fundo, registo de integração.

---

## 8. Sponsorship

### 8.1 `sponsorship_pipeline`
Pipeline kanban (lead/contacted/proposal/negotiating/closed/lost).
| stage (enum), supplier_name, proposed/confirmed_amount, currency, iva_rate |
| is_barter, barter_description |
| auto_sync_bp (promove para event_forecasts) |
| linked_forecast_id, linked_transaction_id |
| owner_user_id, contact_*, next_followup_date, lost_reason |

### 8.2 `sponsorship_pipeline_activities`
Histórico de notas/contatos (kind enum).

---

## 9. Calendário e Local

### 9.1 `cities`, `venues`
Cidades + locais (capacity, address).

### 9.2 `venue_reservations`
Reservas de sala por data.

---

## 10. Sistema

### 10.1 `system_audit_log`
Audit genérico (entity_type, entity_id, action, old_data, new_data, metadata).

### 10.2 `trash`
Soft-delete 30d (entity_data + related_data jsonb).

### 10.3 `undo_actions`
Ações undo (payload jsonb, expira 30d).

### 10.4 `user_activity_log`
Páginas visitadas.

### 10.5 `system_reminders` / `system_reminder_settings`
Lembretes WhatsApp Twilio (cron diário).

### 10.6 `accounting_exports`
ZIPs de exportação contábil (period, counts).

### 10.7 `rls_legacy_audit_reports`
Reports do cron 02:30 RLS audit.

---

## 11. Auth & Segurança

### 11.1 `login_attempts`
Rate limiting por email/IP.

### 11.2 `mfa_recovery_codes`
5 códigos hash, single-use.

### 11.3 `mfa_trusted_devices`
30d (device_token_hash, expires_at, revoked_at).

### 11.4 `push_subscriptions`
Web push (VAPID): endpoint, p256dh, auth.

### 11.5 `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`
Sistema de email (Lovable Email + suppression).

---

## 12. Enums (USER-DEFINED)

- `app_role`: platform_admin, admin, manager, editor, viewer, accountant, partner
- `bp_formalidade`: estimado, cotacao, negociado, fechado
- `sponsorship_stage`: lead, contacted, proposal, negotiating, closed_won, closed_lost
- `sponsorship_activity_kind`: note, call, email, meeting, etc.

---

## 13. Funções/RPCs (security definer)

- `current_company_id()` → uuid (resolve via PA override → profile)
- `is_platform_admin()` → bool
- `has_role(user_id, role)` → bool
- `has_permission(user_id, perm)` → bool
- `row_belongs_to_current_company(company_id)` → bool
- `create_bp_snapshot(event_id)` — auto + cascade Master→Splits
- `promote_scenario_to_active(version_id, ...)` — promove cenário
- `restore_*_from_trash(id)` — admin/manager
- `analyze_formalidade_bulk()` / `apply_formalidade_suggestions_map()` — IA bulk
- `mark_forecasts_fechado_auto()` — flag auto_suggested
- `calibrate_forecast_boost(event_id, window)` — calibrador simulador
- `consume_recovery_code(code)`, `validate_trusted_device(token)` — MFA
- `run_rls_legacy_audit()` — auditoria daily
- `expandOverheadToSplits()` — proração virtual (helper TS+SQL)

---

## 14. Triggers principais

- `on_auth_user_created` — popula `profiles` + `user_roles`
- `audit_*_changes` — system_audit_log para suppliers/companies/user_roles/user_permissions/financial_accounts
- Validação de capacidade (lots ≤ zone capacity)
- Validação de saldo negativo (financial_accounts)
- `snapshot_bp_versions_to_trash` — cascade delete
- Validação de payment_date para status=paid

---

## 15. RLS (resumo)

- 349 policies. Padrão:
  - PERMISSIVE SELECT: `auth.uid() IS NOT NULL` (a maioria) ou `has_role`
  - PERMISSIVE INSERT/UPDATE/DELETE: por role (admin/manager/editor)
  - **RESTRICTIVE `company_isolation_*`**: `company_id = current_company_id()` em todas as multi-tenant
- Storage: 8 buckets privados (camarim-documents, transaction-docs, supplier-docs, ticket-imports, backups, company-logos, etc.) — Signed URLs 1h.
- **`portal_settings` — leitura pública (`anon`)**: a view `public.portal_settings_public` é `security_invoker` e lê `public.portal_settings` sem filtro. Como o portal público lê como `anon`, é obrigatória uma política PERMISSIVE de SELECT para esse role: `portal_settings_select_public` (`FOR SELECT TO anon USING (true)`). Sem ela o portal recebe zero linhas e o `gtm_container_id` (GTM), rodapé, redes sociais, texto "Sobre", cupão e pixel deixam de ser injetados. Migração: `20260615120000_portal_settings_anon_select.sql`. As políticas `portal_settings_*_company` continuam a cobrir o role `authenticated` (escrita/leitura por empresa).

---

## 16. Storage Buckets

| Bucket | Privado | Conteúdo | Acesso upload |
|---|---|---|---|
| `transaction-documents` | ✅ | Faturas, comprovativos | admin/manager/editor |
| `supplier-documents` | ✅ | NIF, contratos | admin/manager |
| `camarim-documents` | ✅ | OCR receipts | camarim_manage/team |
| `ticket-imports` | ✅ | XLSX/PDF imports | admin/manager |
| `backups` | ✅ | JSON dumps | system |
| `bp-attachments` | ✅ | Externos refs (links) | admin/manager |
| `company-logos` | público | Branding | admin |
| `event-attachments` | ✅ | Anexos genéricos | admin/manager/editor |

---

## 17. Domínio Ads (`crm.*`)

O schema `crm.*` é o domínio de marketing/ads (não o ERP em `public.*`). Acesso só
por edge functions com `service_role`; RLS `tenant_isolation_*` (company-scoped via
`current_company_id()`) + `service_role_bypass`. As tabelas-espelho têm
`last_synced_at` e **não** são source of truth para status/budget.

### 17.1 Meta (`crm.meta_*`)
Campanhas/adsets/ads (snapshots), insights diários, criativos, diagnóstico 360,
strategies. Documentado em `docs/integrations/meta-ads.md` e `meta-creatives-sync.md`.

### 17.2 Google Ads (`crm.google_*`) — Sprint 1
Migration `20260610011843_e60a623e-9f5a-4791-9c90-4f2333bb2b3d.sql`. Espelha o padrão `crm.meta_*`
(RLS + GRANT `USAGE`/`SELECT/INSERT/UPDATE` a `authenticated` e `service_role`).

| Tabela | Função |
|---|---|
| `crm.google_click` | Atribuição de clique. `gclid`/`gbraid`/`wbraid` (exatamente um; gclid `varchar(255)` case-sensitive), `landing_url`, `referrer`, `utm_*`, `event_id`→`events`, `client_event_id`, `lead_capture_id`, `consent_granted`, `captured_at`, `expires_at` = `captured_at + 90 dias` (preenchido por **trigger** `BEFORE INSERT/UPDATE`; não coluna gerada — `timestamptz + interval` é STABLE). |
| `crm.google_conversion` | Fila de conversões (Data Manager API, Sprint 2). `conversion_action_ref`, clique (gclid/gbraid/wbraid), `conversion_value`, `currency_code`, `order_id`=`transaction_id` da venda (dedupe UNIQUE), `conversion_datetime`, `status` pending/sent/failed, `data_manager_job_id`, `error_detail`, `sent_at`. |
| `crm.google_campaign` | Espelho de campanhas (Sprint 2). `customer_id`, `external_campaign_id`, perf em micros. |
| `crm.google_ad_group` | Espelho de ad groups (Sprint 2). |
| `crm.google_keyword` | Espelho de keywords Search (Sprint 2). |
| `crm.google_asset_group` | Espelho de asset groups Performance Max (Sprint 2). |

As tabelas-espelho referenciam `crm.ad_platform_connections` (que já aceita
`platform='google'`). Detalhe em `docs/google-ads.md`.
