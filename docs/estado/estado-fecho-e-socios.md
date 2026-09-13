# Estado — Fecho de evento e sócios

Última actualização: 2026-09-13 (épica #146, ponto (f) construído e por publicar).

## Onde estamos

- **(f) Selo do fechamento — construída, testada em Test, POR PUBLICAR.**
  - `event_settlements` tem `is_sealed`, `sealed_at`, `sealed_by`, `sealed_snapshot`,
    `seal_note`, `sealed_bp_version_id`.
  - RPCs `seal_event_settlement` / `unseal_event_settlement`: selar exige as duas
    conferências a 0,00 €; reabrir exige motivo. Ambas registam em `system_audit_log`
    (`settlement_sealed` com `bp_version_id`/`check1`/`check2`; `settlement_unsealed`
    com `reason`).
  - `_bp_version_id`, quando não nulo, tem de pertencer ao mesmo evento
    («A versão de BP não pertence a este evento»).
  - Guarda por trigger: alterações directas aos campos do selo são recusadas
    («O selo só se altera por selar/reabrir»). As RPCs marcam
    `app.settlement_seal_op = 'on'`; a comparação usa `COALESCE(...,'') <> 'on'`
    (com `current_setting(..., true)` puro a guarda não bloqueava — corrigido).
  - Frontend: `src/lib/settlement-seal.ts` (puro, 6 testes), `SettlementSealControl`,
    `EventSettlementsPanel`, `EventSettlementsManager` (controlos desactivados com
    «Fechamento selado: reabra-o para poder alterar.» e fechamentos selados fora do
    selector de pai), `useEventSettlementEngine` a ler os campos do selo.
  - `create_bp_snapshot` recusa eventos Split; nesse caso sela-se sem `bp_version_id`.
  - Procedimento: passo «Selar o fechamento» em `docs/procedimentos/PROC-fecho-evento.md`.

- **Correcção A — quota do fechamento acima passa a opcional.**
  Rótulo «Quota do fechamento acima (opcional)» + ajuda «Deixa vazio (0%) se este
  fechamento vive só das suas próprias receitas e despesas marcadas.»; vazio grava 0;
  criar já não exige %; base da quota com default «resultado com despesas c/IVA».
  Sem DDL: o CHECK `event_settlements_root_no_share` já aceita 0.

- **Correcção B — espelho `event_partners` deixa de apagar sócios.**
  `event_partners_sync_from_settlements(uuid)` (agora `returns integer`, EXECUTE só a
  `service_role`, chamada por `trg_esp_sync_event_partners` via `PERFORM` — trigger
  confirmado a funcionar) garante uma linha por cada `supplier_id` que seja
  participante `partner` em **qualquer** fechamento do evento; valores do participante
  `settles` se existir, senão do `nominal` (raiz primeiro, depois o mais antigo);
  só apaga quando o sócio não consta de nenhum fechamento; FK recusada devolve
  mensagem legível. Sync corrido em todos os eventos com fechamentos:
  **9 linhas, diferença simétrica 0** face à baseline (Anitta intacta).
  Regra replicada em `src/lib/event-partner-mirror.ts` + 5 testes.

## Pendentes de limpeza (dados de teste em Live)

- Fechamento-filho de teste `e810ede8-fb9f-4dc0-abe0-5ffad9d2cb77` («Teste (apagar)»,
  30% de `net_result`) no evento Mágicos Henry & Klaus
  `e8c7594d-474b-4fcc-b4c6-126e93ab11fd` — **por apagar** (mantido só para a demonstração).
- Versão de BP de teste `b0038ec3-0892-4c2c-80e3-a5de5736c41f` — fica como **histórico**,
  não apagar.

## A investigar antes de configurar a Anitta

- **Sinal da C2 com participante `nominal` em fechamento-filho**: no teste dos Mágicos
  a C2 deu **−968,18** (deveria fechar a 0,00). Suspeita: sinal/direcção da quota do
  pai quando o filho tem nominal. Plano: teste do motor com os **três níveis da Anitta**
  (raiz + dois filhos) antes de configurar a Anitta a sério. A Anitta não muda até isso
  estar resolvido.

## Próximos passos

1. Publicar a (f) (pedido explícito do Pedro; ainda não feito).
2. Teste do motor dos três níveis da Anitta e correcção do sinal da C2 com nominal.
3. Apagar o filho de teste `e810ede8…` nos Mágicos.
4. Configurar a Anitta (três níveis) só depois de 2 e 3.
5. Encerrar a épica #146 quando a (f) estiver publicada e a Anitta configurada.
