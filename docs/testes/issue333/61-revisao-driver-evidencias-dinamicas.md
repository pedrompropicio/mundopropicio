# Prova61 — revisão da prova60: correções e prova dinâmica (fase8 PARCIAL)

Data: 2026-10-18 ~16:27 UTC. HEAD confirmado igual Lovable/GitHub main:
6f4c57f22df2637c2ac7ca7a70a8f6cf3525ebf5. Escopo: LOCAL/ISOLADO apenas.
Zero Cloud writes, contas, logins Cloud, DDL, deploy ou Publish. Produto intacto.

## 1. SQL do preflight — corrigido e validado por execução real

Defeito: a query do preflight em `run-cloud57.ts` terminava
`...'data_entry_pilot8_gate(text)'::regprocedure)) preflight` — faltava um
fecho do `jsonb_build_object` externo (3 aberturas, 2 fechos).
Correção: `)))` antes de ` preflight`. Nenhum outro byte alterado.

Validação NÃO por string assertion: PostgreSQL 17.9 local descartável
(initdb em /tmp, uid sem privilégios), fixtures isoladas mínimas
(auth.users, standalone_invoices, data_entry_pilot8_allowlist,
data_entry_settings, standalone_attempt_settings_333, current_company_id(),
log_table_change(), set_company_id_on_insert(), auth.uid(),
data_entry_pilot8_gate(text)). A query EXATA foi extraída de run-cloud57.ts
por regex, os 3 parâmetros ${q(...)} substituídos, e executada com
ON_ERROR_STOP=1: sintaxe + execução OK. Script: /tmp/browser/issue333-pg/validate-preflight.py
(descartável; não faz parte do repo).

## 2. Tipagem do driver e contrato do relay

- `connectedDriver58` options.select: `(query:string)=>Promise<any>` →
  `(query:string, expectedKeys?:string[])=>Promise<any>` (era chamado com
  expectedKeys mas tipado sem).
- `response_contract` emitido pelo CLI: agora
  `{id, fingerprint: sha256(query), data: official row array}`.
- Typecheck explícito (o tsconfig do app pode não incluir docs/testes):
  `tsc --noEmit --strict --skipLibCheck --types node --module esnext
  --moduleResolution bundler --target es2022` sobre run-cloud57.ts,
  private-cloud57.ts, future-runner.ts, baseline58.ts → 0 erros (TSC-OK).

## 3. Worker Chromium — prova DINÂMICA (não estática)

Defeito da prova60: os testes de persistência/captura do worker só liam o
código. Agora há 4 testes dinâmicos com Chromium real + doubles isolados
(`double-server60.py`: página mínima com os controlos exatos que o worker
conduz + endpoint data-entry falso, tudo em 127.0.0.1, sem tráfego externo):

- ok: par execute 200/200, browser.json gravado atomicamente (sem .tmp
  residual), executeRequests=2, check conferido, reopen ok, e o ficheiro NÃO
  contém o access_token nem a string 'access_token'.
- partial_fail: segunda perna do par com connection reset — a resposta
  observada (200/conferido) é preservada, a falha é registada como
  `{transport_failure: <tipo>}`, nenhuma resposta é inventada. Isto exigiu
  corrigir o worker: `asyncio.gather(..., return_exceptions=True)` (antes
  uma falha parcial perdia o par inteiro).
- preview_fail (falha ANTES do par): browser.json gravado com
  failure={type,stage:'prepare'}, pair_statuses null, executeRequests 0.
- blocked_fail (falha DEPOIS do par): pair_statuses [200,200] preservados,
  pedido bloqueado registado, failure sanitizada.

Ficheiros: `src/test/issue333-worker60.test.ts` (4 testes, todos PASS),
`docs/testes/issue333/pilot8/double-server60.py` (novo).

## 4. Escopo da leitura pós-revogação — verificado, sem mudança

Contrato aprovado (#333, memória document-entry-assistant, teste
"owner existing-session read survives revoked preparation"): revogar a
capacidade de preparar/executar NÃO proíbe a leitura autenticada do próprio
lote já registado. O `checkReadOnly` do driver espera HTTP 200 + status
'conferido' + zero escritas (baseline antes/depois) — está conforme o
contrato. Nenhuma alteração de produto.

## 5. Relay e cleanup — testes adicionados

- Relay stale/fora de ordem/duplicado: resposta para 0001 com fingerprint da
  query 0002 → rejeitada; resposta para 0002 com id 0001 → rejeitada
  (src/test/issue333-proof60.test.ts, novo teste).
- Cleanup com doubles: logout E ban a falhar → erro
  'Cleanup proof incomplete: global_logout,ban_created_user' e a verificação
  de sessões corre na mesma (independente); sessions≠0 sozinho bloqueia a
  conclusão mesmo com logout/ban limpos (src/test/issue333-future-runner.test.ts,
  2 novos testes).

## Comandos e resultados

- PG local: validate-preflight.py → "PREFLIGHT SQL: syntax + execution OK in
  local PostgreSQL 17.9".
- tsc explícito dos 4 ficheiros do driver → TSC-OK.
- vitest worker60: 4/4 PASS (Chromium real, ~8s).
- Suite completa: 181 ficheiros, 1465 passed, 1 skipped, 11 todo, 0 failed.

## Lacunas restantes (honestas)

- O piloto real Cloud NÃO foi reexecutado: browser.json/pair_statuses/
  check pós-revogação reais continuam por produzir em ambiente Cloud.
- O double cobre o fluxo feliz e 3 falhas; não cobre timeouts de rede lentos
  nem respostas 409/503 do endpoint real.
- A query do preflight foi validada com fixtures mínimas; os MD5 das funções
  reais só são verificados contra Live numa execução autorizada.

## Complemento Cloud proposto (NÃO executado)

Reexecutar o piloto único com este driver corrigido, só mediante nova
autorização expressa do Pedro: 1 conta fixture nova, 1 PDF, mesma prévia com
par execute, browser.json + pair_statuses + check pós-revogação reais,
revogação e finally completos. Estimativa: 1 execução, ~10 min.

## Estado

Fases 1–7 concluídas (inalteradas). Fase8: PARCIAL. Fases 9–18 pendentes.
Errata da prova60 registada no próprio ficheiro.
