---
name: Transactions ↔ BP linkage
description: Como TX se ligam ao BP (FK direta + match fuzzy), regra L2, fluxo manual com escrita da FK e página de Reconciliação histórica
type: feature
---

# Vinculação Transações ↔ BP (event_forecasts)

## Modelo de dados

- Única FK: `event_forecasts.transaction_id` → `transactions.id` (nullable).
- **Não existe** `transactions.forecast_id` nem `transactions.bp_id`. TX desconhece o BP — é o BP que aponta para a TX.
- Uma linha BP pode apontar para uma e só uma TX (back-link 1ª parcela). Instalações múltiplas (N parcelas) usam UNION direct+category.

## Como o sistema computa "consumo de verba do BP"

Em `EventForecast.tsx` (L2823-2909) o consumo é calculado pela UNION de:

1. **Vínculo direto**: `event_forecasts.transaction_id === tx.id`.
2. **Match fuzzy** (fallback): `tx.category_id === forecast.category_id && tx.type === forecast.type && tx.event_id === forecast.event_id`, com winner-takes-all por tokens da descrição quando há múltiplas linhas para a mesma categoria.

O match fuzzy é o que permite que TXs criadas sem FK (a maioria do histórico) continuem a aparecer como consumo no painel. Mas é também a razão pela qual a regra L2 não era enforçada: TX sem FK = TX órfã, qualquer L3 aceite.

## Fluxos de criação

### Manual (`TransactionFormModal`)

1. User abre o modal a partir de `Transactions.tsx` ou `TicketOfficeSettlementModal`.
2. Painel BP lista L2 → L3 → linhas. Clicar em linha:
   - Pré-preenche `category_id`, `description`, `amount`, `iva_rate`, `specification`.
   - Seta `selectedForecastId = line.id` (a FK que vai ser escrita).
3. Filtro de categoria em tempo real: enquanto `selectedForecastId` está set, dropdown só mostra L3 do mesmo L2 (helper `getL2Id` em `src/lib/bp-category-constraint.ts`).
4. Helper text abaixo do dropdown: `🔒 Categoria limitada pelo BP: <l2_code> <l2_name>` + botão **Trocar linha BP** (limpa `selectedForecastId`, reabre painel; preserva fornecedor/valor/datas/descrição).
5. Reset automático: quando `form.event_id` muda, `selectedForecastId` volta a `null`.
6. No INSERT (single-tx path em `createMutation`): após criar a TX, executa
   `UPDATE event_forecasts SET transaction_id = <novaTxId> WHERE id = <selectedForecastId> AND transaction_id IS NULL`.
7. Split (rateio): a TX-mãe (event_id=NULL) recebe FK do `selectedForecastId` quando o user escolheu uma linha do BP Master. Modelo 1↔1 com a mãe; filhas continuam sem FK. Sem isto, splits em turnê deixavam o BP Master órfão (caso Aéreo Simone 2026-04). Defesa `AND transaction_id IS NULL` impede sobrescrita.

### Automático (`EventForecast.tsx` → "Gerar Transações")

`bulkCreateTxMutation` (L1006-1093) sempre escreveu a FK corretamente. Sem mudança.

## Edição (`TransactionEditModal`)

- Pre-fetch via `linked-forecast` query lê `event_forecasts.transaction_id = tx.id`.
- Se ligada, dropdown de categoria filtrado por L2 e helper text mostrado.
- Botão **Desvincular do BP**: marca `unlinkBpRequested=true`, helper text muda para warning. Reversível antes de gravar.
- Ao gravar: se `unlinkBpRequested`, executa `UPDATE event_forecasts SET transaction_id = NULL`.

## Trigger L2 (defesa universal no banco)

`trg_enforce_tx_category_l2_match` (BEFORE INSERT/UPDATE em `transactions`):
- Verifica `EXISTS event_forecasts WHERE transaction_id = NEW.id`.
- Se existir e o L2 da `NEW.category_id` ≠ L2 da `forecast.category_id` → bloqueia.
- Se não existir FK (TX órfã) → aceita qualquer L3.

Trigger irmão `trg_enforce_forecast_tx_link_l2_match` impede que o lado BP (UPDATE em `event_forecasts.transaction_id`) ligue a uma TX em L2 incompatível.

## Regra de negócio

- **TX vinculada a BP** (com FK escrita): obrigatório L3 do mesmo L2 do BP.
- **TX órfã** (sem FK): aceita qualquer L3. Decisão consciente do user de não amarrar a uma linha BP específica.
- Match fuzzy continua a funcionar para reporting/painéis, mas não é gatilho de validação L2.

## Backfill histórico (Mundo Propício, 2026-05-16)

Migration `20260516181303_*` aplicou backfill seguro **só para empresa `mundo-propicio`**:

- Procura TXs sem FK cujo (event_id + category_id + type) bate em **1 única linha BP livre**.
- Escreve `event_forecasts.transaction_id` apenas se passar validação L2 defensiva (`validate_tx_category_l2_match`).
- Loop com EXCEPTION handler — qualquer falha é logada via NOTICE mas não interrompe o lote.
- Em Test processou 5 candidatos. Em Live (após publish): ~53 candidatos esperados; restantes 35 vão para a página de Reconciliação para revisão humana.
- Coala **não** entra no backfill (todas as TXs Coala são ambíguas, precisam decisão manual).

## Página de Reconciliação histórica (`/admin/reconciliacao-bp-tx`)

Acesso: admin / manager / platform_admin. Lista apenas TXs sem FK direta, agrupadas em 3 abas:

### Aba 1 — Ambíguas
`cat+event` bate em 2+ linhas BP livres. Cada linha é apresentada como card com **descrição BP, valor previsto e % de match por tokens**; a com maior score recebe badge "Sugerido". Ação principal: **Vincular**. Alternativa: **Marcar como TX órfã legítima**.

### Aba 2 — L2-only
Categoria L3 da TX **não** existe no BP mas o L2 sim. Para cada candidato no mesmo L2:
- **Vincular e mudar L3** (faz UPDATE em `transactions.category_id` para o L3 da linha BP, depois escreve FK).
- Alternativa: **Criar linha BP nova com o L3 atual (€0)** + vincular.
- **TX órfã legítima**.

### Aba 3 — Fora do BP
L2 da categoria não existe no BP do evento. Ações:
- **Criar linha BP nova com a categoria da TX (valor da TX)** + vincular.
- **Mudar categoria para uma do BP** (dropdown só com L3 dos L2 já no BP — sem ligar automaticamente).
- **TX órfã legítima**.

### Persistência das "ignoradas"
Tabela `bp_tx_reconciliation_ignored (id, company_id, transaction_id UNIQUE, ignored_by, ignored_at, reason)`. RLS:
- SELECT: `company_id = current_company_id() OR platform_admin`.
- ALL: admin/manager da empresa OU platform_admin.
- Trigger preenche `company_id` e `ignored_by` automaticamente.

### Filtros
Evento (multi-select por dropdown), data desde/até. Contadores no header + botão "Atualizar".

## Outros pontos que inserem TX (não tocados)

- `CacheTransactionModal.tsx`, `Quotations.tsx`, `RecurringTransactions.tsx`, `FinancialOperationsTab.tsx`: criação direta sem painel BP visual. TX nasce órfã. Replicar `selectedForecastId` se um dia precisarem.
- `EventForecast.tsx` (bulk gerar TX): já correto.

## Cronograma de parcelas

TX com cronograma (rows em `transaction_payments` com `scheduled_date` ou `status IN ('planned','cancelled')`) continua a ser **1 TX = 1 FK para BP**. A FK `event_forecasts.transaction_id` aponta para a TX-mãe, não para parcelas individuais. Ver `transaction-installments.md`.
