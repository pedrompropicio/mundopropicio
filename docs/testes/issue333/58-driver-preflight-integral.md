# #333 — correção58 e preflight integral antes conta

HEAD recebido `99bf1ffc7473688f29496533d7cd9ea3083ba05e`. Correção somente test-only; fase6/7 não reabertas e fase8 Cloud não executada. Nenhuma conta, login, DML/DDL, upload, fatura, deploy ou Publish Cloud.

## Mapping comprovado
Memória `reimbursement-notes` e código `ReimbursementNoteDetail.tsx`/`accountant-tx-docs.ts` lidos: `reimbursement_notes` guarda estado, total e `payment_transaction_id` consolidado; `reimbursement_note_items` liga nota às transações de origem. São duas relações distintas, ambas na baseline financeira integral. Sem exclusão financeira por owner. `public.reimbursements` foi removida somente do schema descartável deste ensaio.

Inventário `baseline58.ts` verifica numa query todas as relações/colunas explícitas usadas no driver, incluindo Auth metadata/sessions, readiness, facts, receipts, profiles/roles, configurações e catálogo de funções. SELECT oficial: `incompatibilities=[]`. Antes de qualquer SQL de baseline/fixture, runner executa esse inventário e recusa com lista única de incompatibilidades.

## Leituras Live, somente oficiais
Mesmo SQL `proof58/baseline.sql` executado duas vezes, 13:10:42 e 13:11:21 UTC: 15 relações COUNT+HASH idênticas e configuração das funções idêntica. Ordenação por representação JSON completa, não ordem física. NULLowners anteriores preservados por IS DISTINCT FROM. Mudanças concorrentes são listadas separadamente, nunca classificadas como defeito do produto.

- reimbursement_notes: 44 / `e40349ec169b75224dca0710ee898dfb`.
- reimbursement_note_items: 180 / `6490b4bf0dc630da6f25e5f635ed4316`.
- SELECT final: marcador/referência ausentes, allowlist0, core0/attempt0; cinco fontes MD5 esperadas iguais.
- Nenhuma identidade futura foi consumida; IDs/password/JWT não publicados nesta prova.

Esta baseline cobre dados das 15 relações e ACL/owner/search_path/source das funções selecionadas; não é uma auditoria global de todos os buckets/policies do ERP.

## Mesmo driver interligado, local real
`connectedDriver58` é usado pelo CLI final e pelo teste `pg/driver58.test.ts`. AuthAdmin HTTP local, spool SELECT real com respostas PG, handler real `pilotScoped=true/uploadEnabled=false`, disco real e Chromium React com o mesmo `cloud-browser57.py`. Boundary local substitui sessão/empresa do app; não equivale a Auth Cloud nem à página completa Transações.

Probe/preflight não possuem sessão nem efeitos e execute exige sessão da identidade. PDF exato 1517 B / application/pdf / 0600 / SHA256 `8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f`, pdfinfo e validateDocument exato HEAD PASS. Sem regeneração.

PASS: uma sessão/doc/prévia; nome do servidor no checkbox; dois requests simultâneos com o mesmo corpo/prévia; uma fatura/resultado; EUR0/IVA0; auditoria no máximo1; download SHA/size; retoma antes revogação; check depois revogação com baselines completas iguais; logout, ban identidade única e sessions0. Zero efeitos nas sete relações financeiras, com guardas que recusam writes. Schema financeiro local inclui colunas observadas no catálogo Live, enum formalidade representado como text apenas no fixture descartável.

`uploadEnabled=false` não bloqueia este ramo: handler linha132 usa capability scoped quando `pilotScoped=true`. Nenhuma alteração do produto necessária ou feita.

Falhas encontradas/corrigidas somente locais: import da configuração Vitest; stylesheet externa (agora respondida vazia, sem egress); tipo Promise<Response>; ausência de row-array unwrap/id no relay; reutilização de spool antigo. Timeout Auth sem retry, timeout relay/readiness, falha execute incerta/finally e recusa pré-conta têm testes permanentes. Não houve tentativa Cloud.

## Handshake e comandos finais
CLI emite diretório fresh `/tmp/issue333-select58-*`; request `NNNN.request.json` tem `{id,query}`. Agente executa query pela ferramenta oficial SELECT e grava resposta0600 `{id,data:[linha oficial]}` em `NNNN.response.json`. Driver verifica ID, unwrap da primeira linha e timeout60s. Nenhum SQL de mutação passa pelo spool.

Controlador continua separado: descobre identidade pela metadata do marcador revisto, aplica exclusivamente activation SQL e depois revoke SQL via seu query_database. Readiness até5min, sem login prévio. Pedido de coordenação emitido sem IDs/credenciais. Expiração não substitui revogação. Nenhuma automação Cloud foi iniciada.

Teste integral reproduzível (PostgreSQL17 disponível no PATH):
```sh
bunx vitest run --config docs/testes/issue333/pilot8/driver58.config.ts
```
Próxima tarefa, somente com controlador pronto para SQL coordenação:
```sh
bun docs/testes/issue333/pilot8/run-cloud57.ts --authorized-single-pilot57
```
O comando ainda exige ambiente privado do executor e revalida PDF/metadata/ausência/fontes/baselines antes da única conta. Não foi executado nesta entrega.

## Qualidade e limites
1 teste integral PG/Chromium PASS; 12 testes permanentes drivers/timeout/recovery PASS; suite177ficheiros/1418testes PASS, 1skip/11todo preexistentes. CI39125583006 e39104862318 success no HEAD recebido; CI do novo código não observada. Logs/manifesto/output sanitizado em proof58. Build/typecheck pelo harness, não manual.

Sem prova Auth/runtime Cloud positiva; retoma UI pós-revogação continua não alegada. Fase8 só o controlador verifica/marca após piloto. Reserva333 mantida; #323/DECISIONS/AGENTS/0194/portal-track intactos.