---
name: Event settlements (Fechamentos)
description: Fundação dos Apuramentos por evento — event_settlements + event_settlement_participants, modos settles/nominal, casa implícita e espelho temporário de event_partners
type: feature
---

# Fechamentos por evento (épica #146, sub-tarefa (a) — 12/09/2026)

> **Terminologia (13/09/2026).** O termo visível ao utilizador é **Fechamento**. Este documento usa "apuramento" como sinónimo histórico; o modelo técnico é `settlement` e não muda.

## Modelo

`public.event_settlements` — um apuramento por nó:

- `event_id`, `company_id` (isolamento multi-tenant), `name`, `position`
- `parent_id` (NULL = raiz; **índice único parcial** garante uma raiz por evento)
- `parent_share_pct` + `parent_share_basis` (`net_result` | `net_result_gross_expenses`) — obrigatórios nos filhos, proibidos na raiz (CHECK)
- selo: `is_sealed`, `sealed_bp_version_id`, `sealed_at`, `sealed_by`

`public.event_settlement_participants` — quem participa em cada apuramento:

- `participant_kind` `house` | `partner` (`house` sem `supplier_id`, `partner` com — CHECK)
- `event_partner_id` → `event_partners(id)` **ON DELETE CASCADE** (com SET NULL o participante espelhado ficava órfão: o vínculo era limpo antes de o trigger AFTER DELETE correr)
- `mode` `settles` (é pago) | `nominal` (aparece mas não acerta)
- `profit_pct`, `loss_pct` (NULL = igual ao lucro), `expense_includes_iva` (NULL = herda o evento)
- `can_order`, `can_pay`, `visible_in_docs`, `notes`
- únicos parciais: um `partner` por `supplier_id` por apuramento; uma `house` por apuramento

## Integridade

Trigger `validate_settlement_participant` (BEFORE INSERT/UPDATE):

1. o participante tem de pertencer ao evento do apuramento;
2. a `house` só existe no apuramento raiz;
3. um sócio (`supplier_id`) tem no máximo **um** participante `settles` por evento.

## Espelho TEMPORÁRIO de `event_partners`

`event_settlement_sync_root(_event_id)` (SECURITY DEFINER, EXECUTE revogado a PUBLIC/anon) cria a raiz `"Fecho do evento"` se faltar, espelha cada linha de `event_partners` como `partner`/`settles`, apaga espelhos órfãos (rede extra além do CASCADE) e recalcula a `house`:

- `house.profit_pct = 100 − Σ percentage`
- `house.loss_pct = 100 − Σ coalesce(loss_percentage, percentage)`

Trigger `trg_event_partners_mirror_ins` (AFTER INSERT/UPDATE/DELETE em `event_partners`) chama-a. **Temporário até à sub-tarefa (e)**, quando os ecrãs passarem a ler os apuramentos e o espelho é retirado.

## RLS

Réplica do padrão de `event_partners`: SELECT a autenticados (+ policy do próprio sócio via `user_has_event_access` + `user_supplier_id`), escrita só admin/manager, RESTRICTIVE `company_id = current_company_id()`.

## O que NÃO faz ainda

- Nenhum cálculo consome estas tabelas: card, Fecho, Encontro de Contas, Portal e `house-partner.ts` continuam em `event_partners`.
- Sem perímetro de receitas/despesas por apuramento, sem cascata pai↔filho, sem C1/C2, sem documentos por apuramento, sem selo operacional.
- UI: painel **só leitura** "Apuramentos" (`src/components/EventSettlementsPanel.tsx`) na aba Sócios.

## Estado inicial em produção (12/09/2026)

7 raízes, 9 participantes espelhados + 7 `house`. Σ `profit_pct` dos `settles` = 100 em cada raiz. Anitta: ANITTA 70/0, EVERYTHINGISNEW 15/(igual), casa 15/85. Coala PT 2026: casa a 0 (a MP é sócio explícito como supplier) — **é correcto, não corrigir**.

## Perímetro (b) — 12/09/2026

Coluna **`event_settlement_id`** (NULL) em `event_forecasts` e em `transactions`,
`ON DELETE SET NULL`, índices parciais `idx_event_forecasts_event_settlement` e
`idx_transactions_event_settlement`. Zero linhas marcadas na aplicação da migração.

**Armadilha:** `transactions.settlement_id` é o **fecho de bilheteira**
(FK `ticket_office_settlements`) e já existia — não confundir com
`event_settlement_id`, que é o apuramento do evento (#146).

Triggers:
- `validate_forecast_event_settlement` / `validate_transaction_event_settlement`
  (BEFORE INSERT OR UPDATE OF `event_settlement_id`, `event_id`): o apuramento tem
  de pertencer ao mesmo evento da linha; apuramento `is_sealed` não aceita marcar
  nem desmarcar; transação **sem `event_id`** (mãe de rateio) com apuramento é
  recusada. Não há propagação mãe→filhas: a filha valida-se pelo seu próprio
  `event_id`, porque a mãe de rateio nunca tem evento.
- `prevent_delete_event_settlement_with_lines` (BEFORE DELETE em
  `event_settlements`): recusa apagar um apuramento com linhas marcadas.

`create_bp_snapshot` serializa `to_jsonb(f.*)`, logo `event_settlement_id` entra no
`snapshot_payload` sem alteração.

UI: `src/components/EventSettlementSelect.tsx` (só renderiza quando o evento tem
2+ apuramentos; hoje nenhum tem, logo o campo é invisível), ligado ao
`TransactionEditModal` e ao `ForecastEditModal`; badge "Perímetro" por apuramento
no painel da aba Sócios. Nenhum cálculo consome ainda a coluna — resultado e
repartição por apuramento são a sub-tarefa (c).

## Motor (c) — 12/09/2026

`src/lib/event-settlement-engine.ts` — `computeSettlementEngine(input)`, função
**pura** (não fala com a BD). Totais do evento vêm de
`src/lib/event-settlement-inputs.ts` (`computeEventSettlementTotals`, réplica fiel
do bloco de cálculo do `PartnerSettlementTab`: bilheteira via `ticket_sales` com
exclusão da rubrica 1.1.01 nas transações, despesa realizada ou previsto+excedido,
overhead por toggle, IVA linha a linha). Hook `useEventSettlementEngine` carrega e
usa o MESMO critério de custo do Fecho (`useFechoBasis`, store único por evento).

Fórmulas:

- **Perímetro:** a raiz apanha `total do evento − linhas marcadas`; cada filho só as
  suas linhas marcadas. Fonte da despesa segue o critério do Fecho (realizado → tx;
  previsto+excedido → BP).
- **Quota do filho** = `parent_share_pct` × resultado do pai na `parent_share_basis`.
  Irmãos não se subtraem entre si; a quota sai do dinheiro do pai (`moneyNet`).
- **Resultado do nó** em duas bases: `R_s = quota + receitas − despesas s/IVA`,
  `R_c = quota + receitas − despesas c/IVA` (receita é sempre s/IVA, D24).
- **Parte do participante** = % × resultado **na base do participante**
  (`partnerUsesGrossExpenses`; a casa é sempre s/IVA por convenção da empresa
  gestora, D-ERP10). Resultado negativo usa `loss_pct` (NULL = igual ao lucro).
- **Residual da MP** = resultado s/IVA do evento − Σ partes dos `settles`,
  decomposto em `declarada` (participantes `house`) + `ivaDeductible`
  (Σ parte s/IVA − parte na base do sócio) + `nominalGap` (partes `nominal`, que
  não são pagas aqui) + `rest`.
- **C1**: Σ partes pagas + residual = resultado s/IVA do evento.
  **C2**: `rest = 0` — ≠ 0 significa percentagens que não fecham (erro a mostrar).

Erros devolvidos em `errors`: mais de uma raiz, pai inexistente, filho sem %,
sócio a acertar em dois apuramentos, participante fora da árvore.

**Paridade provada (12/09/2026):** `scripts/prove-settlement-engine.ts` (só leitura)
deu **0,00 €** de diferença em 13 participantes / 6 eventos, parte e valor final
(com despesas pagas pelo sócio e extras aplicados como no ecrã). A 7.ª raiz é do
tenant Coala Festival Portugal e a RLS esconde-a à sessão MP — correcto.
O motor NÃO faz pools de liquidez/caução (isso é do Encontro de Contas até (e)).

UI: painel `EventSettlementsPanel` mostra resultado s/IVA e c/IVA, quota do pai,
tabela de participantes, bloco "Mundo Propício residual" e os dois selos de
conferência, com rodapé "Dados ao vivo — não substitui o Encontro de Contas até à
peça (e)".

## Operações de terceiros (d) — 13/09/2026

Duas tabelas novas, **vazias** na aplicação:

- `event_third_party_operations` — `kind` ∈ (`ab_bebidas`, `ab_alimentos`,
  `bengaleiro`, `merchandising`, `estacionamento`, `outro`), `source` ∈
  (`ab_module`, `manual`), `gross_amount` (bruto s/IVA), `operator_result`
  (resultado do operador s/IVA), `document_ref`. CHECK `etpo_ab_from_module`:
  `ab_*` ⇒ `source='ab_module'` **e montantes NULL** (lêem-se do A&B ao vivo);
  outros kinds ⇒ `source='manual'`. Índice único parcial: uma operação
  `ab_bebidas` e uma `ab_alimentos` por evento.
- `event_operation_participations` — participação de um apuramento numa operação;
  `mode` ∈ (`gross_pct`, `result_share`, `per_capita`, `fee`) com CHECK a amarrar
  `pct` (0–100) aos dois primeiros e `amount` aos dois últimos. Único
  (operation_id, settlement_id). `settlement_id` com **ON DELETE RESTRICT**.
  Trigger `validate_operation_participation`: operação e apuramento do mesmo
  evento; apuramento selado recusa alterações.

RLS no padrão de `event_settlements` (SELECT a autenticados, escrita admin/manager,
RESTRICTIVE `company_id = current_company_id()`).

### Valor da participação

| modo | valor |
|---|---|
| `gross_pct` | pct × bruto da operação |
| `result_share` | pct × resultado do operador |
| `per_capita` | amount × público (o mesmo do A&B) |
| `fee` | amount |

Fonte `ab_module`: `useEventSettlementEngine` usa `useEventABScenarios` (cenário
**real**) e lê `faturacaoBebidas`/`parteGeradorBebidas` (ou os equivalentes de
alimentos) — o A&B é lido, **nunca duplicado nem escrito**.

### Activo adicional (regra central)

A **raiz não ganha valor novo**: a sua participação já está na receita do
perímetro (linha do BP / sintética A&B); serve só para saber "o que já foi
lançado no pai". Cada **filho** ganha

```
activo adicional = participação do filho − Σ participações dos ascendentes
```

como receita **exclusiva** do nó, somada à receita do perímetro antes de R_s/R_c.

Caso Anitta: raiz `gross_pct` 35 % × 287.138,58 = 100.498,50; nível 3
`result_share` 100 % × 194.468,13 ⇒ activo adicional **93.969,63**.

**C1** passa a incluir `additionalActivesTotal` na âncora do evento; **C2**
mantém-se. Testes: `event-settlement-engine.test.ts` (11 verdes) cobre o caso
Anitta, `per_capita` e `fee`.

UI: `src/components/EventThirdPartyOperationsPanel.tsx` dentro do painel
Apuramentos — lista operações e, por apuramento, modo · valor · já lançado acima ·
activo adicional. Edição mínima gated por `manage_bp`: criar operação manual,
"Ligar ao A&B" (só cria a linha de ligação, sem montantes) e definir participação.
Paridade da (c) repetida a 13/09: 0,00 € em 13 participantes / 6 eventos.

## (e2) — completar a (e): cálculo por apuramento e critério de custo na BD (13/09/2026)

1. **Encontro de Contas calcula pelo nó seleccionado**, com o motor do painel
   Apuramentos: raiz = totais do evento **menos** linhas marcadas com outros
   apuramentos; filho = linhas marcadas + quota do pai + activos adicionais.
   No filho, ecrã e PDF mostram a **origem da quota** e nunca os participantes
   do pai. Sem selecção (ou com um só apuramento) a paridade é obrigatória.
2. **Aba Sócios cria e edita apuramentos filhos** —
   `src/components/EventSettlementsManager.tsx` (gated por `manage_bp`):
   criar, renomear, reordenar (troca de `position` par-a-par), apagar. A UI
   recusa apagar com participantes; a BD recusa com linhas marcadas
   (`prevent_delete_event_settlement_with_lines`) e por RESTRICT nas
   participações de operações. A casa continua só na raiz.
3. **Casa com nominais** — `residualHousePct` e `syncHouse` descontam
   **todos** os sócios `partner` da raiz (`settles` E `nominal`). Se a casa
   absorvesse a parte nominal, o motor contava-a duas vezes (declarada +
   `nominalGap`) e a C2 deixava de fechar. Teste: 70 settles + 15 nominal +
   casa 15 ⇒ `rest = 0`.
4. **Nome do participante** resolve-se de `suppliers.name` via
   `src/lib/settlement-participants.ts` em todos os consumidores (painel,
   Encontro de Contas, PDF, portal).
5. **Documentos estanques** — `partnerDocRows` (destinatário + "Sócios locais"
   = 100 − a sua %) e `visibleSettlementIdsForParticipant` (um participante só
   de um filho **não** obtém a raiz).
6. **CRITÉRIO DE CUSTO É DO EVENTO, NA BASE DE DADOS** —
   `events.cost_expense_source` ('realized' | 'committed', default
   **'committed'**) e `events.cost_include_overhead` (boolean, default **true**).
   `useEventCostBasis` lê e escreve estes campos por react-query (escrita gated
   por `manage_bp`/admin/manager, erro em toast) e `useFechoBasis` é alias.
   `withVat` é **derivado** de `events.partner_calc_basis` — deixou de ser
   toggle e já não vive no localStorage. O card da capa, o Fecho, o Encontro de
   Contas, o painel Apuramentos, os PDFs e o Portal mostram o mesmo número em
   qualquer computador.
   Anitta: **sem caso especial** — fica no default (previsto + excedido, com
   overhead, c/IVA por `partner_calc_basis`), que é o critério da planilha v23/v4.
   O 597.183,45 dessa planilha não se reproduz hoje (faltam os níveis 2/3, os
   activos exclusivos e ajustes de IVA) — peça posterior, com OK do Pedro.

**Prova 13/09 (critério de cada evento lido da BD):** 0,00 € de diferença em
13 participantes / 6 eventos visíveis (`scripts/prove-settlement-engine.ts`, que
deixou de importar o `house-partner.ts` apagado). Anitta: EVERYTHINGISNEW
128.789,00 · ANITTA 417.293,42 · MUNDO PROPÍCIO 128.789,00.

## Selo do fechamento
Selar congela o fechamento: snapshot do resultado + subárvore em `sealed_snapshot`,
versão de BP opcional (`sealed_bp_version_id`, validada contra o próprio evento).
Só se sela com C1 e C2 a 0,00 €. Reabrir exige motivo. Campos do selo são intocáveis
fora das RPCs (trigger + `app.settlement_seal_op`). Selado ⇒ sem editar/mover/remover
e fora do selector de fechamento acima. Desvio selado↔ao vivo é vista interna.

## (g1) Casa em qualquer fechamento, IVA devolvido e nominal gap
1. **A casa (Mundo Propício) pode existir em QUALQUER fechamento**, uma por
   fechamento (índice único parcial). `validate_settlement_participant` deixou de
   a limitar à raiz. Na raiz a casa pode estar em **`nominal`**: nesse caso não é
   uma quota da MP, é o **pool que desce** para os fechamentos abaixo.
   `syncHouse` (aba Sócios) só recalcula a casa da **raiz** e só quando ela está
   em `settles`; a % das casas dos filhos é manual.
2. **Parte declarada da MP** = Σ (pct da casa × resultado do nó) sobre **todos**
   os nós em que a casa está em `settles`. Casa `nominal` nunca é declarada.
3. **`event_settlements.returns_parent_deductible_vat`** (boolean, default false):
   soma ao resultado do filho o **IVA dedutível das despesas do perímetro do pai**
   (IVA linha a linha, critério de custo do evento) e retira-o do dinheiro que
   fica no pai. Só **um** filho por pai pode ter a regra (índice único parcial) e a
   **raiz nunca** a pode ter (CHECK). O motor valida as duas coisas com erro.
   Consequência aritmética: a base dos participantes do pai passa a
   `resultNet − vatReturnedOut`, pelo que o termo "IVA dedutível" do residual da MP
   fica **0** quando a regra está activa — sem caso especial no código.
4. **Nominal gap** = Σ, para participantes `partner` em `nominal` que tenham um
   `settles` noutro fechamento do mesmo evento, de (parte nominal − parte real).
   Um `nominal` **sem** `settles` em lado nenhum é **erro de configuração** com
   mensagem clara — era este o caso do teste dos Mágicos que dava C2 −968,18.
5. Residual da MP = declarada + nominal gap + IVA dedutível não devolvido; C1 e C2
   inalteradas nas definições.
6. Prova: caso "(g1) Anitta três níveis" em
   `src/lib/__tests__/event-settlement-engine.test.ts` (planilha de 02/09/2026):
   ANITTA 417.677,51 · Carvalheira 35.800,93 · nível 3 548.198,06 · EIN e casa
   274.099,03 · nominal−real 23.867,29 · residual 297.966,32 · C1 e C2 a 0,00.
