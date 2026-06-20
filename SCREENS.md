# SCREENS.md — Telas, Rotas e Controle de Acesso

> Mapa exaustivo das telas, rotas, ações e permissões necessárias.

Legenda de roles: `PA`=platform_admin, `A`=admin, `M`=manager, `E`=editor, `V`=viewer, `Ac`=accountant, `P`=partner, `CT`=camarim-team-only.

---

## 1. Públicas (sem login)

| Rota | Página | Ações |
|---|---|---|
| `/login` | `Auth.tsx` | Login email/password, OAuth, "Recuperar password" |
| `/reset-password` | `ResetPassword.tsx` | Definir nova password (token via email) |
| `/accept-invitation` | `AcceptInvitation.tsx` | Aceitar convite + criar conta |
| `/unsubscribe` | `Unsubscribe.tsx` | Cancelar emails (token) |

---

## 2. Layout Principal (autenticado, dashboard)

Header fixo: `BrandedLogo`, `CompanySwitcher` (PA), `GlobalSearch`, `NotificationBell`, `ThemeToggle`. Sidebar `AppSidebar`.

### 2.1 Dashboard

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/` | `Index.tsx` | A,M,E,V,Ac | KPIs (saldo, pendências, próximos eventos), gráficos, atalhos |

### 2.2 Eventos

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/eventos` | `Events.tsx` | A,M,E,V (`view_events`) | Listar (filtros: status, ano, cidade, tipo); criar (A,M,E `manage_events`); inline rename |
| `/eventos/:id` | `EventDetail.tsx` | idem | Tabs: Visão Geral, BP, Bilheteira, A&B, Camarim, Sócios, Cache, Sessões, Fecho, Histórico de versões. Ações por tab abaixo |
| `/eventos/:id/simulador` | `EventSimulator.tsx` | A,M (`view_events`) | Forecast/BE/Real, A&B, sponsors, curva de vendas, calibrador, export PDF |
| `/calendario` | `EventCalendar.tsx` | A,M,E,V | Vistas anual/mensal/semanal/agenda; reservas de sala |
| `/demo/simulador` | `EventSimulatorDemo.tsx` | A,M | Demo do simulador |

#### Tabs `/eventos/:id`

| Tab | Componente | Ações |
|---|---|---|
| Geral | `EventEditModal` | Editar nome/datas/tipo/sócios/parceiros |
| BP | `EventForecast` | CRUD linhas, aprovar, gerar transações em lote, adoptar de Master, importar XLSX, anexar links, versionamento, cenários, formalidade |
| Bilheteira | `EventTicketing` | Zonas, lotes (combos), vendas manuais, importar (Ticketline/Fever/Coala), courtesias, sessões, daily attendance |
| A&B | `EventABTab` | Configurar zonas, per-capita, passthrough, repasse |
| Camarim | `TransactionCamarimTab` | Lista sessões; abrir vinculadas |
| Sócios | `EventPartnersTab` + `PartnerSettlementTab` | Editar %, despesas, extras, adiantamentos, settlement |
| Cache | `EventCacheConfig` | Tipos (fixed/tier/%/MG), tiers, deduções, pagamentos, settlement por cidade |
| Sessões | `EventSessionsManager` | Multi-sessão (datas, labels, copy zones) |
| Fecho | `EventFecho` | Custos de fecho + Resultados (Planeado vs Real) |
| Histórico | `BPVersionsHistoryModal` | Versões, comparar até 4, promover |

### 2.3 Transações

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/transacoes` | `Transactions.tsx` | A,M,E (`manage_transactions`); V leitura | CRUD, filtros avançados, split (rateio/IVA), pagamentos parciais, anexos, audit log, batch payment, listas de pagamento |
| `/recorrentes` | `RecurringTransactions.tsx` | A,M | CRUD templates recorrentes |
| `/reembolsos` | `Reimbursements.tsx` | A,M,E | Notas de reembolso, vincular transações, aprovar, pagar |

### 2.4 Plano de Contas / IVA / Contas

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/plano-contas` | `AccountCategories.tsx` | A (`manage_categories`) | CRUD L1/L2/L3, ativar/desativar, mapear |
| `/iva` | `IvaManagement.tsx` | A,M (`manage_iva`) | Regimes IVA |
| `/contas` | `FinancialAccounts.tsx` | A,M (`manage_accounts`); V (`view_balances`) | CRUD bancos/cartões/ticket-office, AccountAccessModal, hidden flag, balanços |

### 2.5 Fornecedores / Cotações

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/fornecedores` | `Suppliers.tsx` | A,M,E (`manage_suppliers`) | CRUD, multi-IBAN, partner flag, créditos, documentos, transações |
| `/cotacoes` | `Quotations.tsx` | A,M,E (`manage_quotations`) | CRUD cotações por evento+fornecedor |

### 2.6 Bilheteiras

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/bilheteiras` | `TicketOffices.tsx` | A,M (`manage_ticket_offices`) | Lista contas bilheteira, eventos vinculados, settlements, advances, audits, importações, vendas |

### 2.7 Camarim

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/camarim` | `Camarim.tsx` | A,M, `camarim_manage` | Lista sessões abertas/fechadas, criar (single/tour), dashboard manager |
| `/camarim/:id` | `CamarimSessionDetail.tsx` | idem (read-only se integrated) | Adicionar itens (OCR), aprovar, split, fund moves, fechar sessão |
| `/camarim-equipa` | `CamarimEquipa.tsx` | `camarim_team` | PWA compacta para utilizadores de campo (CT-only redirect) |

### 2.8 Relatórios (`/relatorios/*`)

Todos requerem `view_reports`. Sub-rotas:

| Sub-rota | Conteúdo |
|---|---|
| `dre` | DRE PT |
| `dre-empresarial` | DRE Empresarial |
| `dre-brasil` | DRE Brasil |
| `pl` | P&L por evento |
| `fluxo-caixa` | Cashflow projetado |
| `extrato` | Extrato bancário |
| `contas-pagar` | Contas a pagar (aging) |
| `listas-pagamento` | Histórico listas |
| `fornecedores` | Resumo por fornecedor |
| `plano-contas` | Movimentos por categoria |
| `movimentacoes` | Reconciliação |
| `bilheteiras` | Auditoria bilheteira (multi-nível) |
| `cache-artista` | Caches por evento/turnê |
| `pendencias-documentais` | Transações sem `is_accounting` |
| `exportacao-contabil` | ZIP com docs fiscais |
| `despesas-socios` | Pagas por sócio |
| `bp-transacoes` | BP vs realizado |
| `exposicao-financeira` | Open + BP balance |
| `rentabilidade` | Margem por evento |
| `evolucao-mensal` | Tendência mensal |
| `desvio-orcamental` | Override BP |
| `aging` | Aging buckets |
| `concentracao-fornecedores` | Concentração risco |
| `projecao-tesouraria` | Tesouraria 90/180d |
| `taxa-ocupacao` | Ocupação por zona |
| `curva-vendas` | Curva temporal |
| `comparativo-vendas` | YoY |
| `mix-receitas` | Receita por categoria |
| `acerto-socios` | Settlement parceiros |
| `indice-pendencias` | KPI de pendências |
| `auditoria-iva` | Auditoria IVA |

Selector de cenário (`ReportScenarioSelector`) em vários relatórios.

### 2.9 Admin

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/admin` | `AdminPanel.tsx` | A,PA | Painel central com cards |
| `/admin/utilizadores` | `UserManagement.tsx` | A | CRUD users, atribuir roles, permissões granulares, convidar |
| `/admin/backups` | `DatabaseBackups.tsx` | A,PA | Listar backups, restore completo/seletivo, tests |
| `/admin/seguranca` | `SecurityDashboard.tsx` | A,PA | MFA enroll/manage, trusted devices, recovery codes, login attempts |
| `/admin/lixeira` | `Trash.tsx` | A,M | Listar/restaurar/purgar (RLS RESTRICTIVE) |
| `/admin/implantacao` | `EventImplementations.tsx` | A | Lista de implantações de eventos passados |
| `/admin/implantacao/:id` | `EventImplementationDetail.tsx` | A | BP+Tickets+Apportionment tabs |
| `/admin/atividade` | `UserActivityLog.tsx` | A | Logs de páginas visitadas |
| `/admin/auditoria-contas` | `AuditoriaContas.tsx` | A | IA review (audit-categories) + reorder swap |
| `/admin/formalidade` | `FormalidadeAudit.tsx` | A | Bulk audit formalidade BP |
| `/admin/empresas` | `admin/Companies.tsx` | PA | CRUD empresas, branding (logo, cores), convidar admin |
| `/admin/lembretes` | `admin/Reminders.tsx` | A,PA | CRUD lembretes (WhatsApp Twilio cron 08:00) |
| `/admin/auditoria-rls` | `admin/RlsLegacyAudit.tsx` | PA | Reports RLS legacy (cron 02:30 daily) |

### 2.10 Suporte

| Rota | Página | Roles | Ações |
|---|---|---|---|
| `/ajuda` | `HelpCenter.tsx` | qualquer | Manual de orientação + pesquisa IA (`help-search`) |

---

## 3. Portal do Sócio (`/parceiro/*`)

Layout `PartnerLayout`. Roles: `partner` only.

| Rota | Página | Ações |
|---|---|---|
| `/parceiro` | `PartnerPortal.tsx` | Lista eventos atribuídos via `partner_event_access` |
| `/parceiro/eventos/:id` | `PartnerEventDetail.tsx` | BP read-only (label "versão vX (data)"), DRE, settlement, anexos |

---

## 4. Camarim Equipa (PWA)

| Rota | Página | Roles |
|---|---|---|
| `/camarim-equipa` | `CamarimEquipa.tsx` | `camarim_team` (forçado se CT-only) |

Vista compacta tipo PWA: criar item rápido (foto+OCR), ver sessão ativa, sem acesso ao dashboard.

---

## 5. Modais e diálogos transversais

- `ApprovedPaymentListReminder` — banner para approver
- `SystemRemindersBanner` — banner amarelo `/admin/lembretes`
- `MfaRequiredGate` — bloqueia rotas para A/PA sem MFA
- `GlobalSearch` — Cmd+K
- `NotificationBell` — push subscriptions
- `LocalReinforcementDialog` — Master vs Local em BP
- `BPViewerModal`, `ForecastEditModal`, `TransactionEditModal`, `TransactionPaymentModal`, `BatchPaymentModal`, `CacheTransactionModal`, `ScheduleInstallmentsModal`, `SplitByIvaModal`, `SponsorsImportModal`, `FeverImportModal`, `TicketUploadModals`, `TicketForecastImportModal`, `PromoteToMasterModal`, `AdoptForecastsModal`, `OpenSessionModal` (camarim), `CamarimItemModal`, `EditSessionModal`, etc.

---

## 6. Redirects automáticos

| Condição | Destino |
|---|---|
| Não autenticado | `/login` |
| `partner` | `/parceiro` |
| Camarim-only (CT sem management) | `/camarim-equipa` |
| Pref `camarim_team_default_landing=1` | `/camarim-equipa` |
| Recuperação password ativa | `/login` (signOut) |
| Admin/PA sem MFA (gate ativado) | `/admin/seguranca` |
| Rota inexistente | `NotFound` (404) |

---

## 7. Permissões resumidas (matriz)

| Ação | A | M | E | V | Ac | P | CT |
|---|---|---|---|---|---|---|---|
| Ver eventos | ✅ | ✅ | ✅ | ✅ | ✅* | ✅* | ❌ |
| Editar eventos/BP | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Aprovar BP/Tx | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pagar (payment list approve) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver saldos contas | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ |
| Camarim — gerir sessões | ✅ | ✅ | ⚠️ camarim_manage | ❌ | ❌ | ❌ | ❌ |
| Camarim — adicionar item | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Relatórios | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Admin (users, backups…) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-empresa switch | PA only | | | | | | |

(* depende de `partner_event_access` ou granular permissions)

---

## 8. MP CRM — Admin (`/crm/*`)

Backoffice do MP CRM (layout `CrmLayout` + `CrmSidebar`), com as áreas de marketing
a par das de portal. Entradas de marketing/ads:

| Rota | Componente | Descrição |
|---|---|---|
| `/crm/meta-capi` | `MetaCapiMonitor.tsx` | Monitor server-side do Meta Pixel + CAPI. |
| `/crm/meta-audiences` | `MetaAudiencesList.tsx` | Custom Audiences Meta. |
| `/crm/google-ads` | `crm-admin/google-ads/GoogleAdsAdmin.tsx` | **Google Ads (Sprint 1 — esqueleto).** Navegação por secção (Conversões, Campanhas, Audiences/Customer Match, Definições) com placeholders; sem lógica de API (gate do developer token + Data Manager API no Sprint 2). |

---

## 9. Cidades multi-país

`CityVenueSelector` filtra `public.cities` pela country da empresa ativa
(`companies.country` ISO → nome via `src/lib/country.ts`: `PT→Portugal`, `BR→Brasil`).
Brasil mostra UF no formato `"Cidade - UF"` (coluna `cities.state`). Criar cidade
nova grava `country` da empresa ativa; em BR o input pede também a UF (obrigatória).
