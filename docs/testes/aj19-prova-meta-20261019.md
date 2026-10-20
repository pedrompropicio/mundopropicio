# AJ19 — prova Meta e monitorização 19/10/2026

Autorização Pedro 23:31 UTC. HEAD inicial 9aa1376d9ca688fe206579a4ccf73b65b4ad47d7 = GitHub main.
Só song-link-event deployada: source SHA-256 f10e9cd3cdfec27e02f513b90e19d5453970f6b627fc214ece2db09f48a08e9c.
Nenhum DDL/Publish/TikTok real de teste. #322/#323 preservadas; reserva libertada.

## Correção
Marca teste_aj19 herdada da chegada em app_open/choice, antes da claim, incluindo mode nos registos derivados. Marca ou código Meta suprime TikTok salvo código próprio TikTok. Marca sem código Meta suprime também Meta, impedindo ViewContent real. Supressão ocorre antes de reserva/token. Log Meta usa allowlist event_id, row_id, event_name, events_received, fbtrace_id; não persiste códigos nem resposta bruta.

## Testes
bunx vitest run src/test/song-link-test-delivery.test.ts src/test/song-link-app-open.test.ts src/test/song-link-ssr.test.ts
3 ficheiros: 19 + 40 + 24 = 83 PASS. Deno check index.ts: exit0. Harness build OK 23:33:10 UTC.

## Prova retida
Chegada por insert SET LOCAL ROLE service_role:
row_id 03302d18-b2ea-43dd-830a-cfa8592ea481
arrival_event_id ad75a9be-c6f9-44f0-9afb-77a7a6f07d4d
origin ssr; mode/utm_source teste_aj19; fbclid/ttclid NULL; capi_status teste; tiktok_status suprimido_teste.
Insert não dispara ViewContent.

app_open: HTTP200 {"ok":true}; row_id30109929-353a-4beb-a684-4de6236c7bd3; mode herdado teste_aj19; destination spotify; opened app; capi_status enviado; tiktok_status suprimido_teste.
Meta ListenClick event_id ad75a9be-c6f9-44f0-9afb-77a7a6f07d4d:open.
Log CAPI 23:33:47 UTC: HTTP200, events_received1, fbtrace_id AFcu_xu17uCe1bONi_JKFge, test true.
Slot meta/ListenClick delivered, reserved_by30109929-353a-4beb-a684-4de6236c7bd3, delivered_at23:33:47.110UTC.

choice posterior: HTTP200 {"ok":true}; row_ida1185f1c-d3a4-43c5-bc1d-97cfbd031099; event_idbd9bc836-2bf6-49dc-83bf-19abac3f6715; mesmo arrival_event_id; mode herdado teste_aj19; capi_status slot_perdido; tiktok_status suprimido_teste. Nenhum segundo ListenClick, nenhum slot TikTok.
Não apagadas as três linhas. Código Meta usado só nos pedidos, nunca neste relatório/configuração/log.

## Monitorização 15 minutos
Intervalo fixo [2026-10-19T23:34:05Z,2026-10-19T23:49:05Z); leitura final23:49:18.649UTC. Filtro mode IS DISTINCT FROM 'teste_aj19'.
196 chegadas; Meta duplicate45/enviado151; TikTok duplicate10/enviado186.
Combinações: duplicate/enviado45; enviado/duplicate10; enviado/enviado141.
fbclid171; ttclid25. Supressão por fornecedor observada; ViewContent não duplicado continua enviado.
99 app_open não marcados:55 android_inline e44 android_retry; origin browser; destination spotify; ambos fornecedores enviado. Contraria a expectativa de zero: há beacons app_open a chegar. Não atribuir a um commit específico sem inspecionar o Portal.

## Limites
Aceitação Meta comprovada pela resposta CAPI/log, não por inspeção do painel Test Events. TikTok de teste não enviado; aguarda código próprio. CI novo SHA não confirmado aqui. Nenhuma alteração em defaults, ACL, dados financeiros ou Portal.

## Prova TikTok 20/10/2026
Código de teste do pixel DARF89JC77U5PB60A4V0 usado só nos pedidos; não gravado em dados, código, log nem relatório.
Correção prévia (só song-link-event): log TikTok com allowlist event_id, row_id, event_name, code, message, request_id (tiktokReceipt; mensagem descartada se ecoar o código). Testes 84/84 PASS. Deploy só song-link-event, source SHA-256 fcaf740c6d61197bf9c46718c8259972ce6129f2f72083b7d2efb4aeeafb4acf.

Chegada marcada (insert SET LOCAL ROLE service_role, slug rs-tt): row_id 5dd12d07-fe13-404c-93bc-4256a6cb1f91; arrival_event_id 0445ba12-e1d7-4cb4-9f89-92b5704e99de; origin ssr; mode/utm_source teste_aj19; fbclid/ttclid NULL; capi_status teste; tiktok_status suprimido_teste.

app_open (só código TikTok): HTTP200 {"ok":true}; row_id d9e30a78-1a51-447e-8124-4fff9e27c07e; event_id 0445ba12-…:open; capi_status suprimido_teste; tiktok_status enviado.
Slot tiktok/CompleteRegistration delivered, reserved_by d9e30a78-…, delivered_at 00:07:02.471 UTC.
Log 00:07:02 UTC: status200, event CompleteRegistration, event_id 0445ba12-e1d7-4cb4-9f89-92b5704e99de:open, code0, message OK, request_id 20261020000702FFB35E4ECB341E9BC5E2, test true.

choice 1 (falha do script de prova, sem event_id): HTTP200, row_id 6663b51d-dc9d-4444-a0fe-c4175b8ae9e0, ClickButton de teste sem event_id (code0 OK, request_id 202610200007116586D54D5B80241B304A); Meta suprimido_teste. Mantida, não apagada.
choice 2 (válida): HTTP200; row_id 5bed01c2-b2fc-4495-8193-6578c2b629f8; event_id f35c259f-eb92-46c9-a951-3180c3f97f4a; capi_status suprimido_teste; tiktok_status enviado. Log 00:07:34 UTC: ClickButton, event_id f35c259f-…, code0, message OK, request_id 202610200007342A1D3E48081D21179A93, test true.
Slots da chegada: apenas tiktok/CompleteRegistration (nenhum segundo CompleteRegistration, nenhum slot Meta).

Limites: aceitação TikTok comprovada pela resposta da Events API, não pelo painel Test Events. Nenhuma linha apagada. CI do novo SHA não confirmado aqui.
