---
name: Transaction installments (Modelo B)
description: Parcelamento de transações — 1 TX fiscal + N rows em transaction_payments com scheduled_date e status (planned/paid/cancelled); triggers DB sincronizam paid_amount/status/payment_date; UI no TransactionFormModal (toggle "Pagar em parcelas") e PaymentTimeline (secção Cronograma com "Marcar como paga" / "Cancelar")
type: feature
---

# Parcelamento de transações — Fase 1

## Modelo conceptual

- **1 TX = 1 documento fiscal**. Aprovação, BP linkage (FK 1:1) e categoria continuam por TX inteira.
- **N parcelas vivem em `transaction_payments`** (mesma tabela das liquidações). Discriminador: `scheduled_date IS NOT NULL` OU `status IN ('planned','cancelled','paid')` no contexto de uma TX com cronograma.
- TX legacy (sem cronograma) ficam intocadas — o trigger detecta e ignora.

## Schema (migrations 20260520*)

```
transaction_payments
  + scheduled_date date NULL
  + status text NOT NULL DEFAULT 'paid'
    -- enum check: planned | paid | cancelled
```

Função helper:

```sql
tx_has_installment_schedule(_tx_id uuid) RETURNS boolean STABLE
  -- true se existe alguma row para a TX com scheduled_date OR status IN ('planned','cancelled')
```

## Triggers

### `trg_sync_paid_amount_from_payments` (AFTER INSERT/UPDATE/DELETE ROW)

Recalcula `transactions.paid_amount`, `status`, `payment_date` a partir das parcelas:

- `paid_sum = SUM(amount) WHERE status='paid'`
- `gross = transactions.amount * (1 + iva_rate/100)` (compara em **bruto**)
- `paid_sum <= 0.01` → `pending`, `paid_amount=0`, `payment_date=NULL`
- `paid_sum >= gross - 0.01` → `paid`, `payment_date = MAX(payment_date das paid)`
- `0 < paid_sum < gross` → `partially_paid`, `payment_date=NULL`

Guard contra recursão: `pg_trigger_depth() > 1` retorna cedo.

**Só age em TXs com cronograma**: `v_has_schedule` (estado actual) OU `v_old_was_schedule` (no DELETE, OLD trazia `scheduled_date` ou status do cronograma). TXs legacy ficam intocadas.

### Bug histórico (resolvido 2026-05-20)

`OLD IS NOT NULL` em PL/pgSQL para composite types segue semântica SQL `ROW IS NOT NULL` — só é true se **todas** as colunas forem não-null. Como `transaction_payments` tem várias colunas nullable (`account_id`, `payment_entity`, `invoice_ref`, `notes`…), `OLD IS NOT NULL` dava `false` em DELETE, o bloco que populava `v_old_was_schedule` não executava, e apagar todas as parcelas não resetava a TX para `pending/0`. Fix: usar `IF TG_OP = 'DELETE'` directamente.

### `trg_validate_installments_total` (BEFORE INSERT/UPDATE ROW)

Bloqueia se `SUM(planned + paid)` exceder `gross + 0.01`. Não conta `cancelled`.

## Regras de negócio

- Status da TX é **derivado**, não editável directamente quando há cronograma.
- Aprovação continua por TX inteira (`payment_lists` inalterada).
- BP↔TX continua 1:1 (regra L2 intacta — ver `transactions-bp-linkage.md`).
- Sync Coala lê TX como antes (1 TX = 1 linha externa).
- IVA: comparação em bruto. `transactions.amount` é líquido, `paid_amount` é bruto (alinhado com a prática legacy).

## Outliers preservados

- TX `31497cab-…` (Aluguel espaço): `paid_amount=11.842€` excede gross calculado. Não tem rows em `transaction_payments` → trigger não age. Mantida intencionalmente para não afectar histórico.

## Roadmap

- **Fase 1** ✅ Schema + triggers + 8 cenários validados (commit `57f35806…`, fix bug C7 a 2026-05-20)
- **Fase 1.5** ✅ Frente B (UI) — toggle "Pagar em parcelas" no `TransactionFormModal` + secção "Cronograma de parcelas" no `PaymentTimeline` com botões "Pagar" e "Cancelar" por parcela

## UI (Fase 1.5)

### `TransactionFormModal` — toggle "Pagar em parcelas"

Aparece **só quando** todas as condições são verdade: `type='expense'`, `!isSplit`, `!autoMarkPaid`, `!isPaidByPartner`, `!isPartnerExtra`, `!is_reimbursement`, `amount > 0`. Inserido logo abaixo dos campos Data Lançamento / Data Vcto.

Quando ON, renderiza `TransactionInstallmentsEditor`:
- Inputs: Nº parcelas (min 2, default 2), 1ª data (default = due_date ou date), Intervalo (semanal/quinzenal/mensal)
- Botão **Distribuir igualmente** — divide gross em N e propaga datas
- Tabela editável (data + valor por linha), com **Adicionar**, **Δ na última** (ajusta a última à diferença) e remover
- Banner vermelho se `SUM(parcelas) ≠ gross` (tolerância 0,01 €)

Ao submeter:
1. INSERT da TX como hoje, mas **força** `status` a `pending/approved` (autoApproved da regra BP normal), `paid_amount=0`, `payment_date=null` — ignora `autoMarkPaid` quando `useInstallments`.
2. BATCH INSERT em `transaction_payments` com N rows: `status='planned'`, `scheduled_date`, `payment_date=scheduled_date` (NOT NULL fallback — trigger ignora `planned`), `payment_method` herdado, `account_id=null`, `withholding=0`, `credit=0`.
3. Trigger `trg_sync_paid_amount_from_payments` mantém TX em `pending/0` (nenhuma parcela `paid`).

Bloqueios validados em `proceedWithCreate` (toast destrutivo):
- Receita
- Split entre eventos (rateio Master)
- `autoMarkPaid` (fluxo "Nova despesa liquidada"), Pago por Sócio, Extra do Sócio, Reembolso

### `PaymentTimeline` — secção "Cronograma de parcelas"

Query agora carrega `status, scheduled_date`. Linhas separadas por `status`:
- **planned** → secção nova "Cronograma" (badge ⏳ amarelo, botões "✅ Pagar" e "❌ Cancelar" se `isAdmin`)
- **cancelled** → mesma secção, riscado/cinza
- **paid** (ou `status` legado nulo) → secção existente "Parcelas pagas"

**MarkInstallmentPaidModal** — pequeno: data efetiva (default=`scheduled_date`), conta financeira (obrigatória), método, retenção/crédito opcionais. UPDATE em `transaction_payments` → trigger DB recalcula `paid_amount/status/payment_date` da TX.

**Cancelar** → `UPDATE status='cancelled'` (com `confirm()` JS). Trigger não conta cancelled na validação nem no `paid_amount`.

### Ficheiros (Fase 1.5)

- novo: `src/components/TransactionInstallmentsEditor.tsx` (+ helper `validateInstallments`)
- novo: `src/components/MarkInstallmentPaidModal.tsx`
- edit: `src/components/TransactionFormModal.tsx` (state, render, validação, batch insert pós-TX)
- edit: `src/components/PaymentTimeline.tsx` (query, secção Cronograma, cancel mutation, mount do modal)

### Limitações conhecidas

- Não permite **dividir** uma parcela existente (Fase 3)
- Não permite renegociar valor total da TX após existirem parcelas pagas (UX bloqueia via fluxos existentes; alteração ao `amount` reflete-se imediatamente na validação do trigger — se exceder o `gross` o INSERT falha)
- Aprovação continua por TX inteira via `payment_lists` (não por parcela)
- Reuso do `ScheduleInstallmentsModal` existente: **parcial** — partilhámos só os helpers `distributeEvenly` e `addByInterval`; UI é inline (não modal) para evitar passar contexto de "forecast" inexistente
- **Fase 2** ⏳ Cashflow / `ReportForecastPayables` a ler `scheduled_date` em vez de `due_date` agregado
- **Fase 3** (futuro) Dividir parcela, renegociação avançada, aprovação por parcela

## Cenários de teste (manter ao mexer no trigger)

| # | Acção | Estado esperado da TX |
|---|---|---|
| 1 | INSERT 1ª `planned` | 0 / pending |
| 2 | INSERT 2ª `planned` | 0 / pending |
| 3 | UPDATE 1ª planned→paid | 73.80 / partially_paid |
| 4 | UPDATE 2ª planned→paid | 147.60 / paid + payment_date = MAX |
| 5 | UPDATE 1 paid→planned | 73.80 / partially_paid |
| 6 | UPDATE última paid→cancelled | 0 / pending |
| 7 | DELETE todas | 0 / pending |
| 8 | INSERT excesso (>gross) | EXCEPTION check_violation |

TX-modelo para reset: `1abb9b9a-09f5-44c7-bf0c-7821f71baba0` (`[SEED] Software SaaS Fev 2026`, amount=120 net, iva=23 → gross=147.60).

---

# Parcelamento ANTIGO — grupos de TXs "(n/N)" (issue #39)

Modelo distinto do Modelo B: **N transações irmãs** ligadas por
`parent_transaction_id`, cada uma com o seu `amount` e `due_date`
(descrições "… (1/2)", "… (2/2)"). Ex.: fatura IMOBIMACUS 4.851,50 € em 2×.

## Como distinguir de um split de rateio

| | Parcela antiga | Split de rateio Master→evento |
|---|---|---|
| `parent_transaction_id` | preenchido | preenchido |
| `split_percentage` | **NULL** | preenchido |
| `event_id` | igual ao pai | evento diferente |

Regra: filha com `parent_transaction_id NOT NULL` **e** `split_percentage IS NULL`
é parcela, não split.

## Fluxo de edição (2026-08)

`src/components/TransactionInstallmentGroupEditor.tsx` (+ hook `useInstallmentGroup`)
renderiza no `TransactionEditModal` sempre que a TX aberta (pai OU filha)
pertence a um grupo com ≥ 2 linhas:

- Badge **"Parcelado em N×"** + **valor total da fatura** (soma das parcelas) —
  substitui a leitura errada como split de rateio.
- Botão "Editar parcelas" abre editor inline com todas as parcelas do grupo:
  vencimento + valor por linha.
- Parcelas **pagas** (`status='paid'` ou `paid_amount > 0.01`) ficam travadas;
  só **admin** as destranca ("Destravar pagas").
- **Distribuir igualmente** espalha `novo total − parcelas travadas` apenas
  pelas parcelas por pagar (`distributeEvenly` de `ScheduleInstallmentsModal`).
- Validação **bloqueante**: soma das parcelas = novo total (tolerância 0,01 €).
- Ao gravar: `UPDATE` por TX alterada + 1 linha em `transaction_audit_log`
  por campo (`Valor (parcelamento)` / `Data Vencimento (parcelamento)`) com
  old/new.
- Permissão: admin ou manager. Editar diretamente uma **filha-parcela** já não
  está bloqueado — abre o mesmo editor com a linha dela editável e o total à vista.

## Migração associada (issue #40)

`DROP FUNCTION public.reverse_payment(uuid, text, text, date)` — sobrecarga
antiga de 4 args removida; fica só a versão com `p_amount`. Todos os callers
(`PaymentTimeline.tsx`) passam `p_amount`. Elimina PGRST203 (ambiguidade).

---

# Identificação ESTRUTURAL do parcelamento (issue #40, 2026-08)

Colunas em `public.transactions`:

- `installment_group_id uuid NULL` — todas as parcelas do mesmo documento partilham este uuid
- `installment_number int NULL` — 1..N, pela ordem de vencimento
- `installment_total int NULL` — N
- índice parcial `idx_transactions_installment_group_id`

**Regra absoluta:** o sufixo `"(n/N)"` na descrição é **cosmético**. Nunca é lido
para decidir se algo é parcelamento — foi o que causava falsos positivos
(ex.: apólices AEGON SEGUROS com "(1/2)" no texto e sem parcelas irmãs).
`INSTALLMENT_PATTERN` foi **removido** de `src/lib/installment-guard.ts`.

## Backfill aplicado em Live (migration tracked)

Critério estrutural: transação-mãe (`parent_transaction_id IS NULL`) com ≥1 filha
onde `split_percentage IS NULL` e `is_transitory = false`.

Resultado: **9 grupos / 19 linhas**. São os 8 grupos com sufixo textual
(Hotel Londres 3×, Aluguel da sala, Aluguel do Teatro, Equipe de Limpeza,
Estrutura Palco, Estruturas Elétricas, Hosp. equipe tec/banda Lisboa,
Palacio do Estoril) **mais** `Transfes - Aero x Hotel (Anitta e Equipe)` — pai
sem sufixo, filha "(2/2)", mesma proforma FP1 226/1132, 966,98 € cada.
AEGON ficou por marcar (0 linhas), como esperado.

## Leitores / escritores

- `src/lib/installment-guard.ts` — `findExistingInstallments` procura por
  `parent_transaction_id`, por `installmentGroupId` (novo param) e por
  `installment_group_id NOT NULL` no mesmo evento+fornecedor com a mesma
  descrição-base. A descrição-base só restringe ao mesmo documento; nunca decide.
- `useInstallmentGroup` (`TransactionInstallmentGroupEditor.tsx`) — caminho
  canónico por `installment_group_id`; fallback legado pai+filhas mantido para
  dados anteriores ao backfill.
- `TransactionFormModal.tsx` — gera `installment_group_id`, marca a 1ª TX como
  1/N e cria as irmãs 2..N com as colunas preenchidas.
- `EventForecast.tsx` (wizard do BP) — o `scheduleInstallmentsMutation` passa a
  preencher as 3 colunas, pelo que o grupo é reconhecido mesmo sem
  `parent_transaction_id`.

## Ação "Renegociar em parcelas" (2026-08-31)

`src/components/TransactionRenegotiateInstallmentsModal.tsx` — transforma uma
despesa que existe como **pagamento único** num grupo de N parcelas. Renderiza
no `TransactionEditModal`, logo abaixo do `TransactionInstallmentGroupEditor`.

### Condições de visibilidade (todas obrigatórias)

- `type = 'expense'`
- `paid_amount = 0` **e** zero linhas em `transaction_payments` (contagem própria,
  hook `useCanRenegotiateInstallments`)
- `installment_group_id IS NULL`
- `split_percentage IS NULL`
- `is_reimbursement = false`, `is_transitory = false`
- não é "Pago por Sócio" (`partner_paid_expenses`) nem "Extra do Sócio"
  (`partner_advance_expenses`)
- evento associado não está `completed`
- `amount > 0`
- Permissão: **admin ou manager**

### Comportamento

- Reutiliza o `TransactionInstallmentsEditor` (nº parcelas, 1ª data, intervalo,
  Distribuir igualmente, Ajustar última, validação da soma contra o **bruto**).
- Diálogo de confirmação em 2 passos: lista parcela a parcela (data + valor),
  marca a parcela 1 como "transação atual" e avisa que os anexos não são
  duplicados. Gravação bloqueada enquanto `validateInstallments` falhar.
- Ao confirmar: gera `installment_group_id` novo; a **original** recebe
  `installment_number = 1`, `installment_total = N`, o valor (base via
  `computeInstallmentNets`, 4 casas) e o vencimento da 1ª parcela — mantendo
  `id`, `forecast_id`, rubrica, fornecedor, ordenador, pagador, conta e anexos.
- Parcelas 2..N são INSERTs novos com o mesmo `installment_group_id`,
  `installment_number = i`, `installment_total = N`,
  `parent_transaction_id = id da original`, `split_percentage = null`, herdando
  os metadados como o `TransactionFormModal` faz.
- Sufixo `"(i/N)"` na descrição de todas — cosmético, nunca lido.
- **Anexos não são duplicados** — ficam na original (parcela 1).
- Auditoria em `transaction_audit_log`: `Valor (renegociação em parcelas)` e
  `Data Vencimento (renegociação em parcelas)` na original + uma linha
  `Criação (renegociação em parcelas)` por parcela criada.
- Não toca em saldos, fecho de evento, vínculo BP, aprovação nem rateio.

### Escrita ATÓMICA no servidor (2026-08-31)

A gravação já **não** é feita pelo cliente. O modal faz uma única chamada
`supabase.rpc("renegotiate_transaction_installments", { p_transaction_id,
p_installments, p_changed_by })` — UPDATE da original + INSERTs das parcelas
2..N + auditoria correm na **mesma transação de base de dados**: se algo falhar,
nada é gravado (antes, um insert a meio deixava a original já reescrita como
(1/N) e o grupo incompleto).

`public.renegotiate_transaction_installments(uuid, jsonb, text) RETURNS uuid`
— `SECURITY DEFINER`, `SET search_path TO 'public'`, EXECUTE só a
`authenticated`. Devolve o `installment_group_id` gerado.

- `p_installments` é um array **ordenado** de `{ due_date, amount }` com o valor
  **BASE (sem IVA)**. O cliente converte bruto→base com `computeInstallmentNets`
  antes de chamar; a função **não recalcula IVA** — só valida a soma contra
  `transactions.amount` (tolerância 0,01 €).
- As 11 condições de visibilidade passaram a existir **também no servidor**
  (`SELECT … FOR UPDATE`, `has_role(auth.uid(), 'admin'|'manager')`, cada uma com
  `RAISE EXCEPTION '<codigo>: mensagem em português'`). Códigos:
  `permission_denied`, `transaction_not_found`, `not_expense`, `already_paid`,
  `has_payments`, `already_installment_group`, `is_split`, `is_reimbursement`,
  `is_transitory`, `is_partner_paid`, `is_partner_extra`, `event_completed`,
  `invalid_installments`, `too_few_installments`, `invalid_due_date`,
  `invalid_amount`, `installments_sum_mismatch`.
- `useCanRenegotiateInstallments` mantém-se: é a **primeira** linha (decide
  mostrar o botão). O servidor é a segunda, não substitui a primeira.
- `translateRpcError` (no modal) traduz os códigos para o toast.
- Multi-moeda: quando `currency <> 'EUR'` e `original_amount` não é nulo, o
  `original_amount` é rateado pró-rata pelo peso da parcela, a 2 casas.
- Verificado em Live num bloco revertido (2026-08-31): (a) 3 parcelas válidas →
  original `(1/3)` e 3 linhas no mesmo grupo; (b) soma errada → recusada;
  (c) já com grupo → recusada; (d) `paid_amount > 0` → recusada; (e) 1 parcela →
  recusada. Rollback confirmado sem resíduos.

### Reconhecimento pelo editor de grupos

`useInstallmentGroup` segue o caminho canónico `eq('installment_group_id', …)`,
exige ≥2 membros não transitórios e ordena por vencimento — as parcelas criadas
aqui cumprem-no, pelo que o `TransactionInstallmentGroupEditor` abre logo com o
grupo completo e valores/vencimentos editáveis. Confirmado por leitura do hook e
por query aos 9 grupos em Live (`installment_number` 1..N contínuo,
`is_transitory = 0`, `split_percentage NULL` em todos).
