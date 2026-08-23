# bilheteira-sync — varredura diária das bilheteiras

Edge function `bilheteira-sync` (cron `bilheteira-sync-daily`, 08:00 UTC / 09:00 Lisboa).
Lê as páginas **públicas** da Ticketline e da BOL e atualiza a régua editorial do portal
(`event_marketing.ticket_lots`, `offer_price_min`, `age_rating`, `doors_time`) + rotação do
destaque da home. Detalhe histórico das versões v1.0–v1.5 em
`.lovable/memory/features/bilheteira-sync.md`.

Regras invioláveis:
- **Nunca marca esgotado automaticamente.** Sem zonas disponíveis → não escreve nada e loga
  `possible_soldout`.
- `lots_locked = true` → curadoria 100% manual, a automação não toca no evento.
- Zonas de **mobilidade reduzida** ficam fora de tudo (régua, preço mínimo, snapshots, alertas).

## v1.6 (2026-08-23) — disponibilidade por zona e alerta "perto de esgotar"

### Novo passo na mesma execução

Depois do parse das zonas e antes de construir a régua, a sync grava um snapshot de
disponibilidade por zona:

- **Ticketline** — `seats_available` já vem no `data-zone-info` que o parser lê. Custo zero,
  `source = 'ticketline_json'`. **Não** gera alerta por si só: a Ticketline não expõe capacidade
  total; só alerta se existir capacidade exata cadastrada em `event_zone_capacities`.
- **BOL, setores de lugar marcado** — 1 request extra por setor à subpágina
  `…/Comprar/Bilhetes/<ev>/<sess>/<setorId>/Lugares`; conta as classes CSS
  (`lugar livre` / `ocupado` / `not-active`). `capacity` = soma das três, `seats_available` =
  livres, `source = 'bol_map'`.
  **Guardrail:** `capacity < 10` → setor descartado (parse suspeito) e registado em
  `raw_summary.zone_capture_errors`. Falha de rede/HTTP num setor → ignora o setor, loga, **não
  quebra a sync**.
- Setores BOL sem mapa mas com capacidade cadastrada à mão entram com `source = 'manual'`.

### Alerta ≤10% (só no digest)

Para cada zona com **capacidade exata** (`bol_map` ou match em `event_zone_capacities` pelo
`zone_label`, case-insensitive, com fallback do nome sem sufixo de lote):

- `seats_available / capacity <= 0.10` **e** no snapshot anterior estava `> 0.10` → entra na
  seção **"⚠ Zonas perto de esgotar"** do e-mail digest (evento, zona, restantes/capacidade, %).
- **Só na transição.** Zonas que continuam ≤10% nos dias seguintes não repetem alerta.
- Sem snapshot anterior → sem alerta (evita falso positivo no primeiro dia).
- Sem capacidade exata → sem alerta. **Nada de estimativa por máximo histórico.**
- O alerta força o envio do digest mesmo que não haja outras alterações. Não altera nada no
  portal.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `bilheteira_zone_snapshots` | Histórico: `event_id`, `provider`, `zone_label`, `seats_available`, `capacity`, `source` (`bol_map` / `ticketline_json` / `manual`), `captured_at`. Índice `(event_id, zone_label, captured_at DESC)`. Escrita só service_role; leitura só admin/platform_admin. |
| `event_zone_capacities` | Allotments exatos cadastrados à mão: `event_id`, `zone_label`, `capacity`, `notes`, `UNIQUE(event_id, zone_label)`. Gerida por admin/platform_admin/marketing_manager; sem acesso anónimo. É aqui que entram os allotments da Ticketline. |

### Notificação

`BILHETEIRA_SYNC_NOTIFY_TO` e `BILHETEIRA_SYNC_NOTIFY_CC` aceitam **vários e-mails separados por
vírgula ou ponto-e-vírgula** (retrocompatível com valor único); o digest é enviado uma vez por
destinatário (dedup case-insensitive). `dryRun` nunca envia e-mail nem escreve snapshots.

### Auditoria

`bilheteira_sync_log.raw_summary.zone_snapshots` guarda os snapshots calculados na corrida e
`raw_summary.zone_capture_errors` os setores descartados. A resposta HTTP inclui `zone_alerts`.
