---
name: Event cash treasury (Fase 1)
description: Camada de tesouraria por evento paralela ao DRE/BP — pool comum, retido em bilheteira, ponte "onde está o dinheiro" e drill-down de Comuns
type: feature
---

## Princípio inegociável

Camada de tesouraria **paralela** ao resultado. Não altera DRE, BP, Acerto de
Sócios nem Resultado. Posições negativas por evento são esperadas e expostas
deliberadamente — não se "corrige" na UI.

## Backend (Secção A — já aplicado)

Migration: `supabase/migrations/20260611120000_event_cash_treasury.sql`.

Funções (SECURITY DEFINER, gate por `current_company_id()` / `is_platform_admin()`):

1. `public.get_event_cash_position(p_company_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)` →
   `level, event_id, master_event_id, parent_event_id, event_name, event_date, is_sub, realized, committed, pending`.
   - Considera contas `bank | cash | prepaid_card` (pool líquido).
   - `realized` = Σ paid_amount sinalado por evento + ajustes `transaction_payments.withholding_amount + credit_amount`.
   - `committed` = approved não pago (`amount − paid_amount`, sinalado).
   - `pending` = transações `pending` sinaladas (menor certeza — destacar visualmente).
   - Linha `level='common'` agrega transações sem `event_id` (inclui pernas de transferência por classificar).
   - Filtro por `payment_date` quando `p_date_from`/`p_date_to`.

2. `public.get_event_cash_position_invariant(p_company_id uuid)` → invariante que
   valida `Σ realized + Σ initial_balance = Σ saldo das contas líquidas`
   (`is_balanced=true`). Em Test e Live, `diff=0,00` nas empresas existentes.

GRANTs: `EXECUTE` a `authenticated` e `service_role`; `REVOKE` a `anon`.

## Frontend (Secções B, C, D-MVP — implementadas)

### Helper partilhado — Retido na Bilheteira (Secção B)

`src/lib/ticket-office-retained.ts` → `fetchTicketOfficeRetainedByEvent(companyId)`
devolve `Map<event_id, valor>`. **Reutiliza a fórmula do
`TicketOfficeBalancePanel`** (`vendas − despesas diretas − adiantamentos
pendentes`), sem duplicar lógica. Tratado como *liquidez condicionada* (depende
do repasse bilheteira/sala — flag `withholds_revenue`).

### Página Tesouraria (Secção D — MVP)

Rota: `/tesouraria`. Permissão: `manage_accounts | view_balances | admin`.
Entrada no `AppSidebar` com ícone `Wallet`, junto a `/contas`.

- Toggle **Tempo real** vs **Por período** (input date → `p_date_from`/`p_date_to`).
- Tabela mobile-first:
  - Linha **Comuns** (sem evento) — click abre drill-down.
  - Master consolidado por omissão (soma `master + subs`) com expand/collapse
    para os sub-eventos (`is_sub` da RPC).
  - Colunas: Realizado, Comprometido, Pendente (com badge ⚠ no KPI), Retido
    bilheteira.
- KPIs globais (Realizado, Comprometido, Pendente, Retido bilh.).
- Click em qualquer evento abre **Bridge sheet** (Secção C).

### Bridge "Onde está o dinheiro" (Secção C)

`src/components/treasury/TreasuryBridgeSheet.tsx`:

```
Realizado de caixa (pool)
+ Comprometido (aprovado por pagar)
− Retido na bilheteira (liquidez condicionada)
− Pago por sócios externos a regularizar (partner_paid_expenses)
= Disponibilidade real do evento
```

- Pendente mostrado abaixo como ressalva (menor certeza, não somado).
- Informativo: participação % Mundo Propício = `100 − Σ event_partners.percentage`.
- Sem reservas automáticas.
- Links rápidos para Evento, DRE e Bilheteiras — **não recalcula DRE/Acerto**.

### Drill-down Comuns

`src/components/treasury/CommonsDrillSheet.tsx` lista transações em contas
líquidas com `event_id IS NULL`. Ferramenta de disciplina de dados — inclui
pernas de transferência por classificar; cada linha abre `/transacoes?id=…`.
Limite 500 linhas.

## Fora desta iteração

- PDF / export do ecrã.
- Toggle "ver tesouraria" no DRE.
- DRE Geral Mensal (Fase 2).
- Alocação gerencial `event_cash_allocations` (Fase 3).
