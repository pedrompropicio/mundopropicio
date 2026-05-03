# DOCUMENTATION.md — MP Gestão Eventos

> Documentação técnica completa da plataforma. Pretende ser auto-suficiente para outro sistema de IA entender o domínio, módulos, fluxos e regras de negócio sem ler código.

---

## 1. Visão Geral

**MP Gestão Eventos** é uma plataforma SaaS multi-tenant de **gestão financeira para produtoras de eventos** (festivais, concertos, turnês, espectáculos). Cobre o ciclo completo:

- Planeamento orçamental (Business Plan / BP)
- Gestão de eventos (simples, master/split de turnês, multi-sessão)
- Bilheteira (capacidades, lotes, vendas reais, importações)
- Operação financeira (transações, fornecedores, pagamentos, contas)
- Acerto com sócios / parceiros
- Camarim (rider técnico e despesas em campo)
- Contabilidade (IVA Portugal/Brasil, retenções, exportação)
- Relatórios (≈30 relatórios analíticos)
- Auditoria, MFA, backups, lixeira, multi-empresa

**Stack**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + @tanstack/react-query + Supabase (Lovable Cloud) + Edge Functions Deno.

**Idioma**: Português (PT-PT). Datas locais YYYY-MM-DD. Moeda principal EUR (suporte BRL/USD com FX).

---

## 2. Arquitectura

```
┌────────────────────────────────────────────────────────┐
│  Frontend SPA (React + Vite)                           │
│  - Routing: react-router-dom                           │
│  - Data: @tanstack/react-query + supabase-js           │
│  - UI: shadcn/ui + Tailwind (Space Grotesk, dark)      │
│  - PWA: manifest + service worker + push (VAPID)       │
└──────────────┬─────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│  Lovable Cloud (Supabase)                              │
│  - 90 tabelas, RLS (PERMISSIVE + RESTRICTIVE)          │
│  - Auth (email/password, OAuth, MFA TOTP)              │
│  - Storage (8 buckets privados)                        │
│  - 38 Edge Functions (Deno)                            │
│  - Cron jobs (backups 03:00, RLS audit 02:30, etc.)    │
│  - Realtime para payment_lists (badge PWA)             │
└────────────────────────────────────────────────────────┘
```

### 2.1 Multi-tenant

- **1 Supabase, N empresas** (tabela `companies`).
- Cada utilizador pertence a 1 empresa (`profiles.company_id`).
- `platform_admin` pode comutar empresa ativa via `profiles.active_company_id` (CompanySwitcher).
- Isolamento garantido por **RLS RESTRICTIVE `company_isolation_*`** em todas as tabelas com `company_id`.
- Branding por empresa (logo, display_name, primary_color, favicon).
- O nome do app **"MP Gestão Eventos" é fixo**; só varia branding cliente.

### 2.2 Ambientes

- **Test** (Lovable Preview) — desenvolvimento, migrações automáticas.
- **Live** (mundopropicio.lovable.app + mpgestaoeventos.com) — produção, scripts SQL aplicados manualmente via dashboard Supabase (formato `.txt` em `scripts/`).

---

## 3. Hierarquia de Conceitos

### 3.1 Eventos

| Tipo | `event_type` | `parent_event_id` | Notas |
|---|---|---|---|
| Simples | `simple` | NULL | Concerto único |
| Master (turnê) | `tour_master` | NULL | Agrupador de cidades |
| Split (cidade da turnê) | `tour_split` | UUID do master | 1 evento por cidade |
| Multi-sessão | `simple` + `event_sessions` | — | Várias sessões no mesmo dia/local |

**Status**: `planning` → `confirmed` → `active` → `completed` (transições disparam snapshots BP, fechos automáticos).

### 3.2 Plano de Contas (Chart of Accounts)

Hierarquia **L1 > L2 > L3** (`account_categories.parent_id`).

- Apenas **nodos L3** são selecionáveis em transações/BP.
- Group 10 está **segregado** dos grupos operacionais (1–4) para custos não-operacionais (estrutura, tecnologia, serviços corporativos).
- Existe um gap intencional entre grupos 4 e 10.

### 3.3 BP (Business Plan)

- Linhas em `event_forecasts` (categoria L3 + valor + IVA + formalidade).
- **Formalidade**: `estimado` | `cotacao` | `negociado` | `fechado` (popover histórico por linha).
- **Status linha**: `draft` | `approved` | `rejected`.
- **Versões**: `bp_versions` — auto-snapshot em transições de evento + cenários paralelos pinados (até 4) com promoção cascade Master→Splits.
- **Master/Split**: rateios Master propagam-se virtualmente aos splits via `master_forecast_id` / `expandOverheadToSplits`.
- **Buckets independentes**: rateios Master e despesas locais consomem baldes BP separados em `splitNeedsBypass`.
- **Approval cascade**: linha BP aprovada → transação criada já aprovada se valor cabe no saldo restante.

### 3.4 Transações

- Tabela `transactions` (1 transação = 1 linha contabilística).
- `type`: `income` | `expense`.
- `amount` é **sempre Net (líquido)** — IVA = `amount * iva_rate / 100` (Art.18 CIVA).
- `status`: `pending` | `approved` | `paid` | `rejected`.
- `payment_date` obrigatório para marcar Paid (tolerância 0,05€).
- **Multi-currency**: `currency` + `original_amount` + `fx_rate`; `amount` em EUR sempre.
- **Parent/Child** (`parent_transaction_id`): rateios Master → cidades.
- **Invoice group** (`invoice_group_id`): split por taxa de IVA — operações irmãs propagam.
- **Pagamentos parciais**: `transaction_payments` (uma linha por parcela).

### 3.5 Bilheteira

```
event → event_dates (datas) → event_sessions (opcional) →
event_ticket_zones (zonas, capacidade) → event_ticket_lots (lotes, preço, IVA, combo) →
ticket_sales (vendas reais)
```

- **Combos** (`is_combo=true`, `applies_to_days=N`): 1 bilhete = N presenças (chave para A&B e atendance).
- **Capacidade**: soma `quantity` dos lotes ≤ `total_capacity` da zona.
- **Importações**: Ticketline (XLSX por zona/global), Fever (2 XLSX), Coala (XLSX V2), PDFs com OCR.

### 3.6 Bilheteiras (Ticket Offices)

- `financial_accounts.type='ticket_office'`: contas que recolhem receita de bilheteira.
- `withholds_revenue=true`: o local retém receita (ex: salas de espectáculos).
- **Settlement** (`ticket_office_settlements`): fecho por evento — gross + deduções → líquido + transferência opcional.
- **Adiantamentos** (`event_ticket_office_advances`) abatidos automaticamente no líquido.

### 3.7 Cache de Artista

- `event_cache_configs`: configura cache por artista (fixed | tier | percentage | minimum_guaranteed).
- `event_cache_tiers`: tiers de % por threshold de ocupação.
- `event_cache_city_settlements`: fecho por cidade (turnê) — source-of-truth do valor efetivo.
- `event_cache_extras` / `event_cache_payments` / `event_cache_deductions`.
- Snap automático para forecasts em sync.

### 3.8 Sócios / Parceiros (`event_partners`)

- `percentage` lucro vs `loss_percentage` prejuízo (assimétrico permitido).
- **Partner Settlement**: cálculo final (`partner_calc_basis`: net_result | gross_revenue).
- **Despesas pagas pelo sócio** (`partner_paid_expenses`): vínculo a transações sem cashflow.
- **Adiantamentos do sócio** (`partner_advance_expenses`): abatem do payout final.
- **Extras do sócio** (`event_partner_extras`): ajustes manuais.

### 3.9 Camarim

- `camarim_sessions` (open → integrated; mode=`single_event` | `tour`).
- `camarim_items`: despesas no terreno com OCR (Lovable AI Gemini).
- `payment_origin`: caixa do sócio, conta company, etc.
- `bp_scope`: `local_city` | `master_overhead`.
- Fecho via edge `close-camarim-session` → snap IVA {0,6,13,23} + cria transações.
- Sessão `integrated` fica **read-only** via RLS.

### 3.10 A&B (Alimentos & Bebidas)

- `event_ab_config` + `event_ab_zones`.
- Participantes elegíveis = **presenças × dia** (combo de 2d = 2 presenças).
- Per capita × repasse % = receita projetada.

### 3.11 IVA

- **Portugal**: 0%, 6%, 13%, 23% (Art.18 CIVA — base líquida).
- **Brasil**: regimes específicos (DRE Brasil dedicado).
- IRS retenção (`declared_withholding_amount`): não altera base mas marca como 100% pago.

### 3.12 Lixeira (Trash)

- Tabela `trash` com retenção 30 dias (`expires_at`).
- Cascade automático para versões BP via trigger.
- RPC `restore_*_from_trash` (admin/manager only).

---

## 4. Módulos (mapa de funcionalidades)

| Módulo | Rota raiz | Descrição |
|---|---|---|
| Dashboard | `/` | KPIs, gráficos, eventos próximos, alertas |
| Eventos | `/eventos` | CRUD eventos, hierarquia master/split, calendário |
| Simulador | `/eventos/:id/simulador` | Forecast vs BE vs Real, A&B, sponsors, curva de vendas |
| Bilheteiras | `/bilheteiras` | Contas-bilheteira, vendas, settlements, imports |
| Transações | `/transacoes` | CRUD, filtros, anexos, pagamentos parciais |
| Plano de Contas | `/plano-contas` | L1>L2>L3, mapeamentos |
| Contas Financeiras | `/contas` | Bancos, cartões pré-pagos, ticket-office |
| Fornecedores | `/fornecedores` | CRUD, multi-IBAN, créditos, docs |
| Cotações | `/cotacoes` | Pipeline de orçamentos por evento |
| IVA | `/iva` | Gestão de regimes |
| Reembolsos | `/reembolsos` | Notas de despesas de funcionários |
| Recorrentes | `/recorrentes` | Templates de transações |
| Camarim | `/camarim` | Sessões + itens OCR |
| Calendário | `/calendario` | Anual/Mensal/Semanal/Agenda + reservas de sala |
| Relatórios | `/relatorios/*` | DRE, P&L, Cashflow, etc. (≈30) |
| Admin | `/admin/*` | Backups, segurança, lixeira, empresas, RLS audit, lembretes |
| Sócio (Portal) | `/parceiro/*` | Vista limitada para parceiros |
| Camarim Equipa | `/camarim-equipa` | PWA-like para utilizadores de campo |

---

## 5. Fluxos Críticos

### 5.1 Ciclo de vida de um evento
1. **Criação** (`planning`) — define datas, zonas, lotes, BP draft.
2. **Confirmação** (`planning → confirmed`) — auto-snapshot BP v1.
3. **Activação** (`confirmed → active`) — auto-snapshot v2; bypass requer justificação.
4. **Conclusão** (`active → completed`) — auto-snapshot "Fecho"; cache → settlement; partner settlement; portal sócio fica read-only para BP.
5. **Reabertura** (`completed → active|confirmed`) — auto-snapshot "Reabertura".

### 5.2 BP → Transação
- Linha BP aprovada → "Gerar transação" (individual ou em lote).
- Transação criada já com `status=approved` se valor cabe no balde restante.
- Vínculo via `event_forecasts.transaction_id` (1ª parcela) + categoria/evento (UNION matching para parcelas).
- **Installments**: 1 linha BP ↔ N transações (`master_forecast_id` ou category match).

### 5.3 Pagamento
1. Transação `approved` → marcada para pagamento.
2. Adicionada a `payment_lists` (status `draft` → `pending_approval` → `approved`).
3. Após approve, parcelas `transaction_payments` registam liquidações.
4. `paid_amount ≈ amount` (tolerância 0,05€) → status `paid`.
5. Tabela `app_badge` (PWA) reflete `payment_lists.pending_approval`.

### 5.4 Importação Bilheteira
1. Upload XLSX/PDF → parser por fonte (Ticketline/Fever/Coala) → preview.
2. Setup automático: cria `event_dates`, `event_sessions`, `event_ticket_zones`, `event_ticket_lots`.
3. `ticket_sales` populadas com `import_batch_id` para rollback atómico.
4. Re-import substitui por fonte (ex: todas vendas Fever).

### 5.5 Master/Split Rateio
- Despesa Master inserida em forecast/transação com `is_overhead=true`.
- **Filhos virtuais**: `expandOverheadToSplits` divide ÷N nas cidades para cálculos (BP, DRE, Results, Settlement).
- **Filhos físicos**: criados em `transactions.parent_transaction_id` apenas em fluxos específicos (não confundir!).
- Rateios local vs Master decididos via `LocalReinforcementDialog`.

### 5.6 Camarim
1. Abrir sessão (single_event ou tour) → orçamento + responsável.
2. Adicionar itens: foto/PDF → OCR (Gemini) → preencher categoria/IVA/origem pagamento.
3. Itens ficam pendentes ou aprovados.
4. **Fechar sessão** → edge `close-camarim-session` cria transações (uma por item ou agregadas), snap IVA, atualiza `integration_summary`.
5. Sessão `integrated` fica read-only.

### 5.7 Backup & Restore
- Cron diário 03:00 UTC → `database-backup` (1 ficheiro/empresa + global) → bucket privado.
- Retenção 30d via `cleanup-old-backups`.
- Restore: completo (`database-restore-v2`) | seletivo por tabela | seletivo por evento (`selective-restore`).
- Auth: cron via anon JWT; restore manual via admin.

### 5.8 MFA
- Obrigatório para `admin` e `platform_admin` via `MfaRequiredGate` (redireciona a `/admin/seguranca`).
- TOTP enroll → códigos recovery (5, single-use) + trusted devices 30d.

---

## 6. Regras de Negócio Críticas

| # | Regra | Tabela/Local |
|---|---|---|
| 1 | `amount` em transactions/forecasts é **NET**; IVA calculado dinamicamente | Art.18 CIVA |
| 2 | Datas em `YYYY-MM-DD` strict local — nunca usar Date timezone-shift | global |
| 3 | `payment_date` obrigatório para `status='paid'` | transactions |
| 4 | Soma `event_ticket_lots.quantity` por zona ≤ `event_ticket_zones.total_capacity` | trigger DB |
| 5 | Combos contam `applies_to_days` presenças (atendance, A&B) | event_ticket_lots |
| 6 | Conta financeira nunca pode ficar negativa (exceto `skip_balance_check`) | trigger |
| 7 | Lixeira retém 30d; depois cleanup automático | trash |
| 8 | RLS `company_isolation_*` RESTRICTIVE em todas as tabelas com company_id | rls |
| 9 | L3 únicos selecionáveis em BP/transações | account_categories |
| 10 | Apenas `admin`/`manager` aprovam payment_lists | role_permissions |
| 11 | Sessão camarim `integrated` é read-only | RLS |
| 12 | Linha BP aprovada cascade → transação aprovada se cabe no saldo | bp-approval-cascades |
| 13 | Rateio Master propaga virtualmente aos splits ÷N | overhead-proration |
| 14 | Edição monetária bloqueada em transações liquidadas | transaction-editing-rules |
| 15 | Snap IVA Camarim: {0,6,13,23} com base líquida | close-camarim-session |
| 16 | "Hoje (Real)" exclui pending; conta apenas paid+approved | results-analysis |
| 17 | Cenário ativo BP é único (resto draft/pinned) | bp_versions |
| 18 | Withholding IRS marca 100% pago sem alterar base | tax-withholding |

---

## 7. Permissões & Roles

Roles em `user_roles` (`app_role` enum):
- `platform_admin` — gere todas as empresas
- `admin` — admin da empresa
- `manager` — operação completa
- `editor` — CRUD limitado
- `viewer` — só leitura
- `accountant` — só áreas contabilísticas
- `partner` — portal do sócio (acesso a eventos via `partner_event_access`)

Permissões granulares em `user_permissions` + `role_permissions`:
`view_events`, `manage_events`, `manage_transactions`, `manage_suppliers`, `view_balances`, `manage_tickets`, `manage_payment_lists`, `manage_iva`, `view_reports`, `edit_approved_bp`, `camarim_team`, `camarim_manage`, etc.

---

## 8. Convenções de Código

- **Nunca** editar `src/integrations/supabase/{client,types}.ts` (auto-gerados).
- **Nunca** editar `.env` (auto).
- Importar Supabase: `import { supabase } from "@/integrations/supabase/client"`.
- Tokens semânticos Tailwind (sem cores hardcoded).
- Toda mutação em DB → `useMutation` + `queryClient.invalidate`.
- Edge functions deployam automaticamente no commit.

---

## 9. Referências Externas

- Documentação interna em `.lovable/memory/` (>80 ficheiros de regras).
- Plano consolidado: `.lovable/plan-multi-tenant-consolidated.md`.
- Specs: `.lovable/specs/`.
- Scripts SQL Live: `scripts/*.txt`.
