---
name: Verba por usar — revisão de fecho LINHA A LINHA
description: Aba “Verba por usar” no Business Plan lista cada linha de BP com saldo e exige decisão; Fecho mostra só resumo/atalho; usa reduce_forecast_budget, event_bp_line_reviews e soft.bp_lines_unreviewed
type: feature
---

# Verba por usar — revisão de fecho por linha de BP (#239, D-ERP131)

Espelho do "excesso por rubrica" (`event-cost-basis.md`), do outro lado do sinal, mas
**por linha de BP** — é a linha que a trava de aprovação mede e é a linha que se ajusta.

## Cálculo — `supabase/functions/_shared/settlement/event-cost-basis.ts`

`computeBpLineReview({ forecasts, transactions, withVat })` → `BpLineReviewRow[]`
(`forecastId`, `categoryId`, `description`, `previsto`, `pago`, `aPagar`, `saldo`,
`pendingCount`, `pendingAmount`), ordenado por `saldo` decrescente.

- Linhas: `event_forecasts` do evento, `type='expense'`, `status='approved'`,
  `version_id IS NULL`, operacionais (`isApprovedOperationalForecast`).
- Realizado: transações do evento com **`forecast_id` = linha** (nunca por rubrica),
  `type='expense'`, status ∈ {approved, paid, partially_paid}, sem `hasResultBlockingFlags`.
- `paidFraction(t)` = `min(paid_amount, bruto)/bruto`; `status='paid'` sem `paid_amount` = 1.
  **Pago** = valor × fracção · **A pagar** = valor − pago. IVA linha a linha (Art.º 18 CIVA).
- **Saldo** = previsto − (pago + a pagar). Só entram linhas com saldo > `EXCESS_EPSILON` (0,005).
- `pending` não entra no realizado — aparece como badge "N por aprovar".

Testes: `src/lib/__tests__/bp-line-review.test.ts` (12 casos).
`computeUnusedBudget` (por rubrica) mantém-se para outros consumidores.

## Painel — `src/components/fecho/BpUnusedBudgetPanel.tsx`

O painel completo renderiza na sub-aba **Business Plan → Verba por usar**, depois de
**Previsão vs Real** e antes de **Evolução**. **Não renderiza** em
`event_budget_mode = 'without_bp'`. No BP recebe as linhas/transações já carregadas
(`forecasts`, `transactions`) para não duplicar queries; fora do BP mantém fallback por
queries próprias. Em Master revê só as linhas do próprio evento visto, sem sub-eventos.

Tabela **agrupada por rubrica L3**: cada grupo tem cabeçalho (código · nome) com os
subtotais Previsto · Pago · A pagar · Saldo e a contagem "N linha(s) (M por rever)".
Grupos ordenados por **código ascendente**; dentro do grupo, linhas por saldo
decrescente. Cabeçalhos **colapsáveis, abertos por defeito**, com "Expandir tudo /
Colapsar tudo" no topo do painel. Colunas das linhas: Descrição · Previsto · Pago ·
A pagar · Saldo · Decisão (a rubrica vive no cabeçalho do grupo).

Cada linha tem duas expansões independentes: **Ver transações (N)** — transações já
vinculadas à linha, com data, fornecedor, nº de fatura (`transactions.invoice_ref`, "—"
se vazio), valor e estado; fica desactivada com o rótulo "Sem transações" — e
**Candidatas a vínculo** (abaixo). O agrupamento e as expansões são só apresentação.
Texto fixo mantido: *"Lista de revisão, não de erro. Faturas de um evento podem chegar
depois de ele acontecer — o valor que deve ficar em cada linha é decisão de gestão."*

**Candidatas a vínculo** (expansível por linha): transações do mesmo evento e mesma
rubrica com `forecast_id` nulo e sem flags bloqueadores, com data, fornecedor, valor e
estado. "Vincular a esta linha" faz `UPDATE forecast_id`; com `installment_group_id`
vincula o grupo inteiro de parcelas (D-ERP77). Sem este passo a revisão mente (#111).

**Decisão** (só com `manage_bp`): *Custo real — fatura por chegar* · *Pago por sócio* ·
*Ajustar previsto*. As duas primeiras gravam em `event_bp_line_reviews` com nota opcional.
A terceira abre diálogo (novo valor, default = realizado; observação obrigatória), chama
`reduce_forecast_budget` e grava a decisão `adjusted`.

**Rodapé, na vista de IVA actual:** Obrigação futura da MP (Σ saldo `pending_invoice`) ·
Financiamento de sócios a devolver (Σ saldo `partner_paid`) · Por rever (Σ saldo sem
decisão válida). A aba do BP tem seletor próprio c/IVA↔s/IVA; por defeito abre s/IVA.

No Fecho (`EventFecho`) fica apenas um cartão-resumo com os três totais, contagem de
linhas por rever e botão **Rever no BP** que abre `tab=forecast&bpTab=unused`. O
reconhecimento global antigo (`event_bp_review_acks`) **deixou de aparecer**; a tabela
e os registos ficam.

## Base de dados

`public.event_bp_line_reviews` — append-only (SELECT + INSERT): `event_id`, `forecast_id`,
`company_id`, `decision` ∈ {`pending_invoice`,`partner_paid`,`adjusted`}, `saldo_at_review`
(**sempre s/IVA**), `note`, `reviewed_by` (default `auth.uid()`), `reviewed_at`.
Índice `(forecast_id, reviewed_at desc)`. RLS pelo padrão de `event_bp_review_acks`:
SELECT a staff + RESTRICTIVE `company_isolation`; INSERT exige
`has_permission_in(auth.uid(),'manage_bp', company_id)`.

**Decisão válida** = a mais recente da linha **e** `saldo_at_review` igual (±0,01) ao saldo
actual s/IVA. Se não bater, a linha volta a "por rever" (badge "Revisão desactualizada").

`public.reduce_forecast_budget(_forecast_id, _new_amount, _observation)` — espelho de
`raise_forecast_budget`: SECURITY DEFINER, `manage_bp` ou platform admin (service_role
aceite), observação obrigatória, `_new_amount` < amount actual e ≥ realizado s/IVA,
**nunca toca em `baseline_amount`**, grava em `forecast_audit_log` com
`field_name='Valor (EUR)'` e observação prefixada `[ajuste de fecho] `.

`event_close_blockers` ganhou `soft.bp_lines_unreviewed = { count, saldo_net }` (linhas com
saldo e sem decisão válida, só em `with_bp`). **Não bloqueia** e não mexe nos `hard`.
A revisão faz-se **antes do selo** (PROC passo 10), porque o ajuste muda o resultado dos sócios.

## Medição em Live — Ivete Clareou 2026, 23/09/2026 (s/IVA)
42 linhas com saldo · **258.136,40 €** de saldo · pago 64.940,32 € · a pagar 36.249,99 €.
Zero linhas com candidatas a vínculo (o evento tem 9 transações sem linha, 19.915,17 €,
todas em rubricas sem saldo). `soft.bp_lines_unreviewed = { count: 42, saldo_net: 258136.40 }`.

## Fora de âmbito
Master de turnê revê-se no seu próprio Fecho. O acerto com sócios não muda de fórmula —
só passa a ler o previsto já revisto.
