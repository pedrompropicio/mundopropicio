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
− Pago por sócios externos a regularizar (partner_paid_expenses)
= Disponibilidade líquida no pool          ← caixa firme
+ Retido na bilheteira (liquidez condicionada)
= Disponibilidade potencial total          ← inclui condicionada
```

**Sinal do Retido**: parcela **positiva condicionada**, nunca subtração. O
Realizado do pool já EXCLUI receita em contas `ticket_office` (fora do pool),
portanto subtrair retido puniria o evento duas vezes. O retido só passa a caixa
firme após repasse bilheteira/sala (`withholds_revenue`). UI mostra os dois
subtotais com distinção visual (badge "inclui condicionada" no total potencial).

- Pendente mostrado abaixo como ressalva (menor certeza, não somado).
- Informativo: participação % Mundo Propício = `100 − Σ event_partners.percentage`.
- Sem reservas automáticas.
- Links rápidos para Evento, DRE e Bilheteiras — **não recalcula DRE/Acerto**.

### Drill-down Comuns

`src/components/treasury/CommonsDrillSheet.tsx` lista transações em contas
líquidas com `event_id IS NULL`. Ferramenta de disciplina de dados — inclui
pernas de transferência por classificar; cada linha abre `/transacoes?id=…`.
Limite 500 linhas.

## Fase 2 — DRE Geral Mensal (folha de síntese para sócios)

Rota: `/relatorios/dre-geral-mensal`. Permissão `view_balances | manage_accounts | admin`.
Página única A4 (mobile-first), seletor de mês (default mês corrente), botão **Exportar PDF**.

### Conteúdo (1 página)

1. **Resultado do Mês** — reutiliza `computeDREEmpresarialMonthly` (helper extraído
   de `ReportDREEmpresarial.tsx` para `src/lib/dre-empresarial-compute.ts` — fonte
   única de verdade, mesmo cálculo do `/relatorios/dre-empresarial`). Lê a coluna
   do mês escolhido: Receitas, Custos Directos, Resultado de Eventos, (se houver
   sócios externos) Distribuição + Margem, Custos Corporativos, **Resultado da
   Empresa**.

2. **Disposição de Caixa** — bridge a nível empresa, 2 subtotais:

   ```
   Realizado de caixa (pool)                ← Σ realized da RPC Fase 1
   − Despesas comprometidas                 ← derivado: receitasAReceber − Σ committed (signed)
   − Sócios externos por liquidar           ← Σ partner_paid_expenses
   = Caixa firme disponível                 ← caixa real agora
   + Receitas a receber                     ← approved income c/ paid_amount<amount no mês
   + Retido em bilheteira                   ← helper fetchTicketOfficeRetainedByEvent
   = Caixa potencial para distribuição      ← inclui condicionada
   ```

   "Receitas a receber" e "Retido bilheteira" entram com sinal **positivo**
   (parcelas condicionadas) — não se subtraem. Dupla contagem evitada
   calculando despesas comprometidas a partir de `Σ committed` da RPC menos
   as receitas a receber já contabilizadas separadamente.

3. **Nota de reconciliação** curta a explicar porque RESULTADO ≠ CAIXA.

### PDF — `src/lib/export-dre-geral-mensal.ts`

jsPDF portrait A4, uma página, cabeçalho com `branding.displayName` + mês +
duas secções idênticas ao ecrã + nota. Filename `DRE-Geral-Mensal-YYYY-MM.pdf`.

### Princípio (mantido)

**Não altera DRE, BP, Acerto de Sócios nem Resultado.** Só lê e agrega.
Sem SQL novo, sem migrations — toda a Fase 2 é frontend.

## Fora desta iteração

- Detalhe por evento dentro do PDF de síntese (apenas totais empresa).
- Toggle "ver tesouraria" no DRE.
- Alocação gerencial `event_cash_allocations` (Fase 3).

