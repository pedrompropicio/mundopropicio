# #62 — enqueue de conversões Google: partir dos leads (regressão D-ERP230)

## Causa (confirmada no código)
`crm-google-lead-conversion-enqueue` lê os cliques em páginas de 1.000 por `captured_at` ascendente e sai do ciclo quando `candidates.length >= MAX_BATCH (5000)`. Com 10.004 cliques na janela, só os 5.000 mais antigos (até 09/09) são vistos. A resposta não diz que houve corte.

## Abordagem escolhida: partir dos LEADS
Porquê: os leads com sinal de clique são poucos (cerca de 119 em 90 dias), e os cliques são muitos e crescem com o tráfego. Partindo dos leads, o trabalho depende do número de leads e não do volume de cliques, e nenhum lead fica de fora.

Fluxo novo:
1. Ler os order_id já enfileirados para a ação (paginado até ao fim, igual ao actual).
2. Ler os leads MP da janela de 90 dias (paginado até ao fim, sem limite) que tenham `raw.gclid/gbraid/wbraid` OU `client_event_id`, e tirar os já enfileirados (contam como `skipped_existing`).
3. Para esses leads, ir buscar os cliques com consentimento e identificador, dentro da janela, em blocos de 100 valores:
   - a) `google_click.lead_capture_id IN (leads)`
   - b) `gclid/gbraid/wbraid IN (identificadores dos leads)`
   - c) `client_event_id IN (client_event_id dos leads)`
4. Casamento por lead, com a mesma ordem e regras de hoje (função pura `matchClickToLead`, sem alterações): lead_capture_id → identificador → client_event_id. Se houver vários cliques, ganha o mais antigo do método vencedor (equivale ao comportamento atual, em que o primeiro clique ganha).
5. Inserir como hoje: upsert com ignoreDuplicates, order_id = lead_capture.id, valor nulo quando não está configurado, ação vinda de portal_settings (7648181457), `raw.match_method` e backfill de `google_click.lead_capture_id`.

Limite de segurança: `MAX_LEADS = 20000` por ronda. Se for atingido, a função processa os mais recentes e responde com `limit_reached: true`, `leads_total` e `leads_processed`. Nunca corta em silêncio.

## Resposta da função (campos)
`leads_considered, skipped_existing, no_click, by_method{lead_capture_id, click_identifier, client_event_id}, enqueued, lead_capture_id_backfilled, limit_reached, errors, window_days, conversion_action_ref, conversion_value`.
`candidates` e `no_lead` passam a `leads_considered` e `no_click`.

## Testes (vitest, src/lib/__tests__/google-click-match.test.ts)
- Nova função pura `pickClickForLeads(leads, clicks)` em `_shared/google-click-match.ts`, que é a que o index usa.
- Defeito reproduzido: 5.001 cliques antigos sem lead + 1 clique recente com lead → o lead recente é escolhido. Teste de controlo: a lógica antiga, com o corte aos 5.000, perdia-o.
- Os 3 métodos e a sua prioridade; clique sem consentimento ou fora da janela ignorado; lead já enfileirado ignorado; `limit_reached` quando se passa o limite.
- Os testes existentes de `matchClickToLead` e `positiveConversionValue` mantêm-se.

## Deploy e prova
- Deploy da edge function (entra logo em produção com o deploy; não é preciso Publish).
- Uma invocação via service role (pg_net com a chave do vault, como o cron). Mostro a resposta e os enfileirados por método.
- Não envio nada à mão. Depois do cron 43 (até 15 min), conto as linhas novas em `sent`, `pending` e `error`.

## Documentação
- `docs/DECISIONS.md`: nova entrada D-ERP260 — regressão da D-ERP230 (corte aos 5.000 cliques, ascendente, silencioso) e a correção (partir dos leads, limite explícito).
- `docs/estado/estado-audience-google.md`: estado do enqueue e números depois da correção.
- Memória `mem://features/google-lead-conversion-enqueue` + linha no índice.

## Fora de âmbito / não mexo
Crons, schema, RLS, #70, Customer Match, valor por lead, metas de campanha. Sem Publish.
