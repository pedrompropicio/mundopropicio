## ⚠️ Ambiguidades a confirmar antes de codar

1. **"Conta mãe / contas filhas" em reembolsos** — no schema actual **não existe transação "mãe" gerada pela nota**. O modelo é:
   - `reimbursement_notes` (a nota R-XXX)
   - `reimbursement_note_items` → aponta para as `transactions` originais (despesas pagas pelo funcionário)
   - Não há `parent_transaction_id` nas transações de reembolso
   
   **Hipótese de trabalho:** "mãe" = a **nota de reembolso** (linha sintética agregadora R-XXX) e "filhas" = as transações com `reimbursement_note_id` via items. O toggle ON renderiza **uma linha sintética por nota** (não vinda de `transactions`) com badge "N itens", expandível para mostrar as transações reais. Confirma?

2. **Onde fica o toggle?** O briefing diz "Modal Notas de Reembolso", mas o toggle afecta a listagem `/transacoes`. **Hipótese:** colocar no header de `/transacoes` (junto aos filtros), não na página `/reembolsos`. Confirma?

3. **`user_preferences` por `(user_id, account_id)`** — `account_id` aqui significa qual contexto?
   - (a) `financial_account_id` da conta financeira filtrada na listagem (multi-select hoje), ou
   - (b) preferência **global por utilizador** (ignora `account_id`)?
   
   **Hipótese:** (b) global — o filtro de contas é multi-select e não há "conta activa única". Se for (a), preciso saber o que fazer quando há 0 ou >1 contas seleccionadas.

---

## Arquivos a alterar/criar (assumindo as 3 hipóteses acima)

### Migration nova
`supabase/migrations/<ts>_user_preferences_consolidate_refunds.sql`
```sql
CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consolidate_refunds_view boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs select" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own prefs upsert" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
```
Mais script `.txt` para Live em `scripts/user-preferences-live.txt`.

### Hook novo
`src/hooks/useUserPreferences.ts` — get/set com TanStack Query + cache local; expõe `consolidateRefunds` e `setConsolidateRefunds`.

### Lógica de agrupamento
`src/lib/refund-grouping.ts` (novo) — função pura `groupTransactionsByRefund(transactions, items)` que devolve uma lista heterogénea de `{kind:'tx', tx}` ou `{kind:'refund-group', noteId, code, employee, total, children:[tx...]}`.
Tem testes em `src/lib/__tests__/refund-grouping.test.ts`.

### Listagem
`src/pages/Transactions.tsx`:
- Adicionar Switch "Consolidar reembolsos" no toolbar (estilo padrão).
- Buscar `reimbursement_note_items` + `reimbursement_notes` via query nova quando toggle ON (ou sempre, leve).
- Substituir mapeamento actual por iteração sobre o resultado de `groupTransactionsByRefund`.
- Estado local `Map<noteId, expanded:boolean>` para chevrons.
- Auto-expand quando filtro/busca matcha filha (estado separado `searchAutoExpanded`).
- Manter somatórios/exports inalterados (operam sobre `transactions` cru, não sobre o agrupado).

`src/components/TransactionRow.tsx`:
- Aceitar prop opcional `groupHeader?: { noteId, count, expanded, onToggle, code, employee, total }` que renderiza chevron + badge "N item(s)" e suprime colunas que não fazem sentido.
- Fallback: comportamento actual.

### Seeds de teste
`src/test/seeds/refund-consolidation.ts` — fixtures TS para os 8 cenários (mock data, não toca DB).

---

## Ordem de implementação

1. Migration + script Live + tabela `user_preferences`
2. Hook `useUserPreferences`
3. Lib `refund-grouping` + testes unitários (cobre cenários 1, 2, 4, 8)
4. Switch + query de items em `Transactions.tsx`
5. Adaptar `TransactionRow` para modo grupo
6. Auto-expand em busca/filtro (cenário 7)
7. Validar exports/relatórios não afectados (grep `getFilteredTransactions` e similares)
8. Seeds + screenshots cenários 1, 2, 4

---

## Pontos de risco

- **Exports e relatórios**: `Transactions.tsx` tem >1500 linhas e várias funções de export. Risco de o agrupamento contaminar o input do export. Mitigação: agrupar **só na fase de render**, manter `filteredTransactions` puro.
- **Performance**: query extra de `reimbursement_note_items` em listagens grandes. Mitigação: 1 query agregada com `select reimbursement_note_id, transaction_id, reimbursement_notes(code, employee_name, status)`.
- **Edição inline / acções por linha**: ao consolidar, os botões de pagar/aprovar/eliminar só fazem sentido nas filhas. A linha "mãe sintética" deve ter acções desabilitadas (ou só "expandir").
- **Busca por texto na "mãe sintética"**: precisa decidir se o code R-XXX e nome do funcionário são searchable também (sugiro sim).
- **Persistência por `(user_id, account_id)`** (Cenário 5) — depende da resposta à pergunta 3. Se for global, o cenário 5 b/c falha por design e precisa ser revisto contigo.
- **Cenário 8 "0 filhas"**: uma nota sem items não aparece hoje na listagem de transações (não há tx ligadas). Sugestão: nesse caso a "mãe sintética" não é renderizada.

Aguardo confirmação das 3 hipóteses (e em particular #3) antes de avançar.
