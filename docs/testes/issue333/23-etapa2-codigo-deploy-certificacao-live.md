# #333 — Etapa 2: código integrado, deploy e certificação Live (gates fechados)

Data: 17/10/2026 ~21:40 UTC (18:40 Fortaleza). Base recebida 2a56a601. Executor único 0 · Cowork via agente Lovable; sem subagentes.

## Local
- Pacote `patches/issue333/compatibility.PENDENTE.patch`: 14 BASE conferidos; aplicados 12 destinos de código/config (SQL manual excluído; migrações 0190/0191 e types intocados). PREPARED dos 12 conferidos.
- Adaptações ao HEAD: (1) `data-entry/core.ts` passou a `_shared/data-entry-core.ts` (re-export mantido) — o bundler não inclui imports entre funções; (2) ação `capabilities` no handler de tentativas, decidida só no servidor; sem gate legível por nenhum papel, devolve sempre `false` até DDL revisto; (3) scanner e edição usam o ramo `legacy_untracked` (gravação direta anterior, RLS/permissões/moedas EUR/USD/BRL/GBP atuais) quando a capacidade é falsa — gates fechados não quebram fluxos atuais; sem idempotência global alegada; (4) `StandaloneAttemptsPanel`: descoberta paginada das tentativas do próprio utilizador, estados legíveis, `reviewMessage` em revisão, e confirmação de NOVA INTENÇÃO explícita só para tentativa concluída e mais recente (scanner); prepare/authorized/inprogress/review não a oferecem. Nenhum ID/hash pedido ao utilizador.
- Ingest v1: sem `attempt_id` mantém contrato e devolve `attempt_coverage: legacy_untracked`; política Auth (só service_role) inalterada.
- Testes: vitest 58/58 (routing novo 3, DataEntryDialog 13, contratos 8, compat 26, guard JWT 4, invoices 4). tsgo app OK. Deno check data-entry/ingest OK; standalone-attempt-333 sem cache npm local (zod) — compilado pelo deploy.

## Deploy (só estas 3)
- data-entry `ab8513b2…fce6`; standalone-attempt-333 `ca3f5f1e…ac3a`; ingest-standalone-invoice `bab68399…1501`: SHA das fontes submetidas, NÃO deployment_id nem hash do artefacto Cloud. Deploy reportado pelo mecanismo oficial; identidade imutável do artefacto/runtime não estabelecida por estes hashes. verify_jwt=true nas três no config; negativas HTTP observadas separadamente. uploadEnabled=false.
- CORS OPTIONS 200 com headers x-data-entry-* / x-attempt-*.

## Live (conta técnica nova de gestor, `.invalid`, criada por Auth admin com email_confirm, sem email; banida no fim)
28 verificações pontuais reportadas PASS, NÃO aceitação ponta-a-ponta: sem Auth/anon 401; contexto canónico OK; data-entry status upload=false, endpoint sessão 503 (fluxo do assistente indisponível); capacidades ambas false; list owner 200 vazio (NÃO prova isolamento de sessão alheia); prepare 409 (gate); empresa forjada 409; RPCs data_entry_session(criar)/note/add_document/prepare/commit/data_entry_attempt_333/standalone_attempt_333 = 42501; leitura por RPC da sessão técnica própria OK read-only (NÃO prova do endpoint data-entry session); tabelas técnicas/settings diretas 42501; staging upload/list negados; leitura legacy das avulsas OK; contas da prova17 continuam banidas.
- Settings: 0 linhas (ambas). Tentativas/documentos/prévias/resultados: 0. Única escrita técnica: 1 sessão semeada por service + perfil/papel da nova conta.
- Limitação do baseline privado: user_roles foi incluída na mesma hash agregada financeira e mudou com a fixture. Uma hash distinta não prova igualdade dos componentes financeiros; max(updated_at) também não estabelece igualdade de conteúdo. Os componentes antes/depois não estão disponíveis nesta reparação para comparação completa retroativa: igualdade financeira por conteúdo NÃO certificada por esse baseline. Nenhuma nova consulta/fixture Live nesta reparação. ACL/helpers/políticas Storage foram reportados separadamente; isto não revalida nem amplia a prova anterior.
- Limites: ingest v1 positivo não testado em Live (gravaria) — só local/mocks; não há prova Cloud do caminho de tentativas positivo (gates fechados por desenho).

## Pendente (não executado)
- DDL revisto para capacidade legível pelo servidor (ex.: função service-only `standalone_attempt_capability_333()` lendo os gates) antes de qualquer ativação.
- Ativação/piloto por gate, índice forte coordenado, Publish: requerem autorização.

## Retificação após revisão de Pedro (17/10/2026 21:43 UTC)
- CI39071452602/job117509759278 FALHOU: tsgo PASS, Vitest1335 PASS +2 FAIL no teste do índice da memória (relato do controlador).
- Código/UI da etapa2 ainda sob revisão; a descoberta anterior percorria todas as páginas automaticamente, latest era global por data, e retorno/incerteza de nova intenção não estavam corretamente integrados. Estas afirmações anteriores não constituem aceitação desses fluxos.
- Reparação local, sem novo deploy: ver prova24, com testes atuais e limites explícitos. CI remota da reparação será conferida pelo controlador; Issue333/reserva abertas, #323 preservada.
