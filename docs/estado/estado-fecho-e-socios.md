# Estado — Fecho, Sócios e Fechamentos

Atualizado: 13/09/2026 (épica #146, alíneas (a)–(e2) construídas; (f) selo em aberto).
Termo de utilizador: **Fechamento** (decisão do Pedro, 13/09/2026). Nomes técnicos `settlement` mantêm-se.

## 1. O que existe hoje

### Fechamentos (`event_settlements`)
Árvore por evento. A **raiz** ("Fechamento do evento") representa o evento inteiro;
cada **filho** é um fecho bilateral estanque que recebe uma **quota do
fechamento acima** (`parent_share_pct` sobre `parent_share_basis`:
`net_result` = despesas s/IVA, `net_result_gross_expenses` = despesas c/IVA).

Hoje em Live: 7 raízes, nenhum filho criado. A Anitta é raiz única.

### Participantes (`event_settlement_participants`) — fonte de verdade
Uma linha por participante e fechamento:
- `participant_kind`: `partner` ou `house` (a casa, Mundo Propício);
- `mode`: `settles` (acerta) ou `nominal` (só informativo);
- `profit_pct` / `loss_pct`, `expense_includes_iva` (base própria do sócio),
  `visible_in_docs`, `can_order`, `can_pay`.

A **casa já não é inventada em código**: é uma linha real, com `supplier_id`
NULL, cuja quota é `100 − Σ profit_pct de TODOS os sócios da raiz` — settles **e**
nominais. `src/lib/house-partner.ts` foi apagado.

`event_partners` é **derivada**: existe para o pagador/ordenador (`can_pay` /
`can_order`) e para as FKs históricas, e é sincronizada pelo trigger
`trg_esp_sync_event_partners` (+ `event_partners_sync_from_settlements(uuid)`,
EXECUTE só `service_role`).

### Marcação de linhas
`event_forecasts.event_settlement_id` e `transactions.event_settlement_id`
(ON DELETE SET NULL) marcam uma linha como pertencente a um fechamento. Validação
por triggers: a linha valida-se pelo **seu próprio `event_id`**; transação sem
`event_id` e com fechamento é recusada. `prevent_delete_event_settlement_with_lines`
impede apagar um fechamento com linhas marcadas.

### Operações de terceiros (`event_third_party_operations` / `event_operation_participations`)
A&B, bengaleiro, merchandising, estacionamento. Modos de participação:
`gross_pct`, `result_share`, `per_capita`, `fee`. A raiz **não ganha valor novo**;
cada filho ganha `participação do filho − Σ participações dos ascendentes` como
receita exclusiva do nó (o "activo adicional").

### Motor (`src/lib/event-settlement-engine.ts`)
Função pura `computeSettlementEngine`. Perímetro por nó, quota do pai, activos
adicionais, base própria de cada sócio (a casa é sempre s/IVA), IVA dedutível da
casa e as conferências **C1** (âncora do evento) e **C2** (a soma fecha). TOL =
0,005 €. `src/lib/event-settlement-inputs.ts` prepara os totais do evento.

## 2. Critério de custo — vive no evento (D57)

`events.cost_expense_source` (`realized` | `committed`, default **committed**) e
`events.cost_include_overhead` (default **true**). Lido por `useEventCostBasis`
(`useFechoBasis` é alias) através de react-query; escrita gated por `manage_bp`
(ou admin/manager), erro em toast. Deixou de haver critério em `localStorage`.

`withVat` é **derivado** de `events.partner_calc_basis` — não é toggle. O card de
receitas mantém preferência local de IVA (não é matéria de fecho).

Consumidores com o mesmo critério: card da capa, Fecho, Encontro de Contas,
painel Fechamentos, PDFs e Portal do Sócio.

## 3. UI

- **Aba Sócios** (`EventPartnersTab` + `EventSettlementsManager`): cria a raiz,
  cria/renomeia/reordena/apaga filhos, adiciona e edita participantes; a casa é
  read-only e recalculada. Tudo gated por `manage_bp` e bloqueado em evento
  concluído ou fechamento selado.
- **Encontro de Contas** (`PartnerSettlementTab`): selector de fechamento (só
  aparece com 2+); calcula pelo nó activo; num filho mostra a origem da quota e
  nunca os participantes do pai; PDF com o nome do fechamento no ficheiro e no
  cabeçalho.
- **Painel Fechamentos** (`EventSettlementsPanel` + `EventThirdPartyOperationsPanel`):
  árvore, participantes com nome resolvido, operações e activos adicionais, C1/C2.
- **Portal do Sócio** e documentos: estanques — cada sócio vê a sua linha e
  "Sócios locais" (100 − a sua %); a equipa interna vê tudo.

## 4. Prova e testes (13/09/2026)

`scripts/prove-settlement-engine.ts` (só leitura, critério de cada evento lido da
BD) — **0,00 € de diferença** em 13 participantes / 6 eventos visíveis; nenhum
`max(updated_at)` mudou. Output cru em
`claude-outputs/2026-09-13-0120-prova-e2-criterio-bd.md`.

| Evento | Participante | Parte |
|---|---|---|
| Anitta - EDA 2026 | EVERYTHINGISNEW | 128 789,00 |
| Anitta - EDA 2026 | ANITTA | 417 293,42 |
| Anitta - EDA 2026 | MUNDO PROPÍCIO | 128 789,00 |
| Ivete Clareou 2026 | SUPERSOUNDS | −185 287,57 |
| Ivete Clareou 2026 | MUNDO PROPÍCIO | −84 078,15 |
| Conferência de Mulheres Plenitude | FEBRACIS PORTUGAL, LDA | −15 991,56 |
| Conferência de Mulheres Plenitude | MUNDO PROPÍCIO | −5 330,52 |
| FestVybbe 2026 | VYBBE | −28 312,08 |
| FestVybbe 2026 | MUNDO PROPÍCIO | −15 364,00 |
| Henry & Klauss - Madrid | HENRY VARGAS PRODUCOES LTDA | −367 940,19 |
| Henry & Klauss - Madrid | MUNDO PROPÍCIO | −157 688,65 |
| Mágicos Henry&Klaus | HENRY VARGAS PRODUCOES LTDA | −27 210,52 |
| Mágicos Henry&Klaus | MUNDO PROPÍCIO | 2 904,53 |

Testes: `event-settlement-engine.test.ts` (12), `settlement-participants.test.ts`
(10) — inclui casa com nominal, visibilidade estanque e documento de filho sem
nomes/% do pai.

A Coala PT 2026 é do tenant Coala e a RLS esconde-a nas leituras da MP — não
entra na prova.

## 5. Em aberto

- **(f) selo do fechamento** — congelar um fechamento (`is_sealed`) e o que fica
  bloqueado a partir daí. Não iniciado.
- **Anitta 597.183,45 da planilha v23/v4** — não se reproduz hoje: faltam os
  níveis 2/3, os activos exclusivos e ajustes de IVA. Peça posterior, com
  autorização do Pedro.
- Publish: as alíneas (a)–(e) foram publicadas a 13/09/2026; a (e2) e esta mudança de
  terminologia ainda não foram publicadas.

## Selo do fechamento (épica #146, ponto f) — 2026-09-13

- `event_settlements` ganhou `is_sealed`, `sealed_at`, `sealed_by`, `sealed_snapshot`,
  `seal_note`, `sealed_bp_version_id`.
- RPCs `seal_event_settlement` / `unseal_event_settlement` (SECURITY DEFINER):
  - selar exige as duas conferências (C1 e C2) a 0,00 € (tolerância 0,005);
  - `_bp_version_id`, quando indicado, tem de pertencer ao mesmo evento
    ("A versão de BP não pertence a este evento");
  - reabrir exige motivo; ambas as operações escrevem em `system_audit_log`
    (`settlement_sealed` / `settlement_unsealed`).
- Guarda: os campos do selo só mudam por estas RPCs. UPDATE directo é recusado
  com "O selo só se altera por selar/reabrir" (trigger + `app.settlement_seal_op`).
- UI: `SettlementSealControl` (selar/reabrir, nota, motivo, marca "Selado em … por …",
  valor selado / ao vivo / desvio — desvio só em vista interna). Fechamento selado
  bloqueia editar/mover/remover e sai do selector de fechamento acima.
- Em turnê, `create_bp_snapshot` recusa Splits: nesse caso sela-se sem versão de BP
  e a UI explica que a versão vive no evento principal.
- Demonstração em Live (Mágicos Henry&Klaus `e8c7594d-…`): selado 9.681,77 € · ao vivo
  9.681,77 € · desvio 0,00 €; versão de BP `b0038ec3-…`; reaberto com motivo "teste (f)".
