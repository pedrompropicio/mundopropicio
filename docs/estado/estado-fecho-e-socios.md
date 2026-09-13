# Estado — Fecho de evento e sócios

Última actualização: 2026-09-13 (épica #146, ponto (g1) construído e por publicar).

## Onde estamos

- **(g1) Motor dos três níveis — construída, testada, POR PUBLICAR.**
  - `event_settlements.returns_parent_deductible_vat` (boolean, default false):
    o fechamento devolve a si o **IVA dedutível das despesas do perímetro do pai**.
    Índice único parcial `event_settlements_one_vat_return_per_parent` (um filho por
    pai) + CHECK `event_settlements_root_no_vat_return` (a raiz nunca). O motor
    valida o mesmo, com erro legível.
  - `validate_settlement_participant` deixou de limitar a **casa** à raiz: a casa
    pode existir em qualquer fechamento, uma por fechamento. Na raiz pode ficar em
    **Nominal** (pool que desce). `event_partners_sync_from_settlements` não mudou —
    a casa nunca vai para `event_partners`.
  - Motor: parte declarada da MP = Σ das partes da casa nos nós onde ela liquida;
    base dos participantes do pai = `resultNet − vatReturnedOut`; **nominal gap** =
    Σ (parte nominal − parte real) dos sócios que liquidam noutro fechamento; nominal
    órfão = erro de configuração explícito (era o caso dos Mágicos, C2 −968,18).
  - UI: checkbox da regra no gestor de fechamentos; aba Sócios permite a casa em
    fechamentos filhos (com % e modo) e a casa da raiz em Nominal, com `syncHouse` a
    tocar só na casa da raiz em `settles`; painel e Encontro de Contas mostram
    «IVA dedutível devolvido» e o residual decomposto.
  - Prova: caso "(g1) Anitta três níveis" (planilha 02/09/2026) verde — ANITTA
    417.677,51 · Carvalheira 35.800,93 · nível 3 548.198,06 · EIN e casa 274.099,03 ·
    nominal−real 23.867,29 · residual 297.966,32 · C1 e C2 a 0,00. Mais os casos de
    erro (nominal órfão, dois filhos com a regra, raiz com a regra) e os 12 antigos.
  - **Nenhum dado alterado:** `event_settlements` 8 linhas, `event_settlement_participants`
    16, `event_partners` 9 — contagens e `max(updated_at)` iguais antes e depois.

- **(f) Selo do fechamento — construída, POR PUBLICAR.**
  - `event_settlements` tem `is_sealed`, `sealed_at`, `sealed_by`, `sealed_snapshot`,
    `seal_note`, `sealed_bp_version_id`.
  - RPCs `seal_event_settlement` / `unseal_event_settlement`: selar exige as duas
    conferências a 0,00 €; reabrir exige motivo. Registam em `system_audit_log`.
  - `_bp_version_id`, quando não nulo, tem de pertencer ao mesmo evento.
  - Guarda por trigger com `app.settlement_seal_op` («O selo só se altera por
    selar/reabrir»), comparação via `COALESCE(...,'') <> 'on'`.
  - Frontend: `src/lib/settlement-seal.ts`, `SettlementSealControl`,
    `EventSettlementsPanel`, `EventSettlementsManager`, `useEventSettlementEngine`.
  - `create_bp_snapshot` recusa eventos Split; nesse caso sela-se sem `bp_version_id`.

- **Correcção A — quota do fechamento acima é opcional** (vazio grava 0%).
- **Correcção B — espelho `event_partners` deixa de apagar sócios** (deriva de
  qualquer fechamento; 9 linhas, diferença simétrica 0 face à baseline).

## Pendentes de limpeza (dados de teste em Live)

- Fechamento-filho de teste `e810ede8-fb9f-4dc0-abe0-5ffad9d2cb77` («Teste (apagar)»)
  no evento Mágicos Henry & Klaus `e8c7594d-474b-4fcc-b4c6-126e93ab11fd` — por apagar.
- Versão de BP de teste `b0038ec3-0892-4c2c-80e3-a5de5736c41f` — fica como histórico.

## Próximos passos

1. Publicar a (f) + (g1) (pedido explícito do Pedro; ainda não feito).
2. **(g2) Configurar a Anitta em Live** (três níveis: raiz com ANITTA 70% settles,
   Carvalheira 10% nominal e casa 20% nominal; Lobinho 30%; nível 3 20% com a regra
   do IVA, receitas exclusivas marcadas, bares e EIN/casa a 50%) e **provar contra a
   planilha v23**. Só depois de 1.
3. Apagar o filho de teste `e810ede8…` nos Mágicos.
4. Encerrar a épica #146 quando a (f)+(g1) estiverem publicadas e a Anitta provada.
