---
name: Transactions ↔ BP linkage
description: Como TX se ligam ao BP (FK direta + match fuzzy), regra L2, e fluxo manual com escrita da FK
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
   Se o UPDATE falhar, toast de erro mas TX permanece criada.
7. Split (rateio) **não** escreve FK: pai/filhos múltiplos não cabem no modelo 1↔1.

### Automático (`EventForecast.tsx` → "Gerar Transações")

`bulkCreateTxMutation` (L1006-1093) sempre escreveu a FK corretamente. Sem mudança.

## Edição (`TransactionEditModal`)

- Pre-fetch via `linked-forecast` query lê `event_forecasts.transaction_id = tx.id`.
- Se ligada, dropdown de categoria filtrado por L2 (mesma regra) e helper text mostrado.
- Botão **Desvincular do BP**: marca `unlinkBpRequested=true`, helper text muda para aviso warning. Reverter está disponível antes de gravar.
- Ao gravar: se `unlinkBpRequested`, executa `UPDATE event_forecasts SET transaction_id = NULL WHERE id = <linkedForecast.id>`.
- Trocar a linha BP via modal de edição não é suportado (UX adicional fica para futuro — o user pode desvincular, depois reabrir o painel BP em nova TX se necessário, ou vincular manualmente pela linha do BP).

## Trigger L2 (defesa universal no banco)

`trg_enforce_tx_category_l2_match` (BEFORE INSERT/UPDATE em `transactions`):
- Verifica `EXISTS event_forecasts WHERE transaction_id = NEW.id`.
- Se existir e o L2 da `NEW.category_id` ≠ L2 da `forecast.category_id` → bloqueia.
- Se não existir FK (TX órfã) → aceita qualquer L3.

Trigger irmão `trg_enforce_forecast_tx_link_l2_match` impede que o lado BP (UPDATE em `event_forecasts.transaction_id`) ligue a uma TX em L2 incompatível.

Com a escrita da FK no fluxo manual (passo 6 acima), o trigger passa a cobrir todos os caminhos — incluindo o caso "Anitta carrinha" que originalmente passou por ser TX sem FK.

## Regra de negócio

- **TX vinculada a BP** (com FK escrita): obrigatório L3 do mesmo L2 do BP.
- **TX órfã** (sem FK): aceita qualquer L3. Decisão consciente do user de não amarrar a uma linha BP específica.
- Match fuzzy continua a funcionar para reporting/painéis, mas não é gatilho de validação L2.

## Outros pontos que inserem TX (não tocados)

- `CacheTransactionModal.tsx`, `Quotations.tsx`, `RecurringTransactions.tsx`, `FinancialOperationsTab.tsx`: não passam pelo painel BP visual; criação direta sem escolha de linha. Não aplicam a regra (TX órfã). Se no futuro precisarem, replicar o padrão de `selectedForecastId` + UPDATE FK.
- `EventForecast.tsx` (bulk gerar TX): já correto.

## UX summary

- Filtro de dropdown em tempo real (forecast set → L3 do L2)
- Botão **Trocar linha BP** (limpa só o vínculo, preserva resto)
- Botão **Desvincular do BP** no editor
- Helper text "🔒 Categoria limitada pelo BP: \<L2\>"
- Reset automático ao mudar de evento
- Sem diálogo anti-fricção separado: filtragem do dropdown já impede escolha fora do L2
