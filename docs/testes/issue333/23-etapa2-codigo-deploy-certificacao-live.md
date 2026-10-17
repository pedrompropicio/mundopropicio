# #333 — Etapa 2: código integrado, deploy e certificação Live (gates fechados)

Data: 17/10/2026 ~21:40 UTC (18:40 Fortaleza). Base recebida 2a56a601. Executor único 0 · Cowork via agente Lovable; sem subagentes.

## Local
- Pacote `patches/issue333/compatibility.PENDENTE.patch`: 14 BASE conferidos; aplicados 12 destinos de código/config (SQL manual excluído; migrações 0190/0191 e types intocados). PREPARED dos 12 conferidos.
- Adaptações ao HEAD: (1) `data-entry/core.ts` passou a `_shared/data-entry-core.ts` (re-export mantido) — o bundler não inclui imports entre funções; (2) ação `capabilities` no handler de tentativas, decidida só no servidor; sem gate legível por nenhum papel, devolve sempre `false` até DDL revisto; (3) scanner e edição usam o ramo `legacy_untracked` (gravação direta anterior, RLS/permissões/moedas EUR/USD/BRL/GBP atuais) quando a capacidade é falsa — gates fechados não quebram fluxos atuais; sem idempotência global alegada; (4) `StandaloneAttemptsPanel`: descoberta paginada das tentativas do próprio utilizador, estados legíveis, `reviewMessage` em revisão, e confirmação de NOVA INTENÇÃO explícita só para tentativa concluída e mais recente (scanner); prepare/authorized/inprogress/review não a oferecem. Nenhum ID/hash pedido ao utilizador.
- Ingest v1: sem `attempt_id` mantém contrato e devolve `attempt_coverage: legacy_untracked`; política Auth (só service_role) inalterada.
- Testes: vitest 58/58 (routing novo 3, DataEntryDialog 13, contratos 8, compat 26, guard JWT 4, invoices 4). tsgo app OK. Deno check data-entry/ingest OK; standalone-attempt-333 sem cache npm local (zod) — compilado pelo deploy.

## Deploy (só estas 3)
- data-entry `ab8513b2…fce6`; standalone-attempt-333 `ca3f5f1e…ac3a`; ingest-standalone-invoice `bab68399…1501` (SHA da fonte submetida). verify_jwt=true nas três (config). uploadEnabled=false.
- CORS OPTIONS 200 com headers x-data-entry-* / x-attempt-*.

## Live (conta técnica nova de gestor, `.invalid`, criada por Auth admin com email_confirm, sem email; banida no fim)
28/28 PASS: sem Auth/anon 401; contexto canónico OK; data-entry status upload=false, sessão 503; capacidades ambas false; list owner read-only 200 vazio; prepare 409 (gate); empresa forjada 409; RPCs data_entry_session(criar)/note/add_document/prepare/commit/data_entry_attempt_333/standalone_attempt_333 = 42501; leitura da sessão técnica própria OK read-only; tabelas técnicas/settings diretas 42501; staging upload/list negados; leitura legacy das avulsas OK; contas da prova17 continuam banidas.
- Settings: 0 linhas (ambas). Tentativas/documentos/prévias/resultados: 0. Única escrita técnica: 1 sessão semeada por service + perfil/papel da nova conta.
- Baselines privados (gitignored): faturas/TX/BP/contas sem alteração; ACL/helpers/políticas Storage iguais.
- Limites: ingest v1 positivo não testado em Live (gravaria) — só local/mocks; não há prova Cloud do caminho de tentativas positivo (gates fechados por desenho).

## Pendente (não executado)
- DDL revisto para capacidade legível pelo servidor (ex.: função service-only `standalone_attempt_capability_333()` lendo os gates) antes de qualquer ativação.
- Ativação/piloto por gate, índice forte coordenado, Publish: requerem autorização.
