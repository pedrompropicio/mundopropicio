# #322 — CI410: subescopo corretivo, 19/10/2026

Autorização expressa Pedro 01:09 Fortaleza, agente livre confirmado pelo controller.
Base local e GitHub confirmados iguais: `ecce9e0e0440a6e9e9bd5695b5930857b46a9b92`.
Exceção somente corretiva; reserva Claude #322 e linha #323 preservadas.

## Causa e correção mínima

O scanner reconhece `isServiceRoleRequest(`, não a atribuição
`isServiceRole: isServiceRoleRequest`. O handler já invocava essa dependência
antes de ler o corpo, configurar CAPI, ler/escrever dados ou enviar eventos.
Substituição sem mudança de autorização/comportamento:

```diff
-  isServiceRole: isServiceRoleRequest,
+  isServiceRole: (req) => isServiceRoleRequest(req),
```

Não se modificou scanner, POR_DESENHO, referência, configuração JWT, handler,
helper multiTenant, tabelas, consentimento, regras de envio ou suspensão.
O diff completo da entrega encontra-se em `ci410-correcao.diff`.

## Trust boundary comprovada localmente

`_shared/multiTenant.ts:isServiceRoleRequest` aceita a chave exata do runtime
(segredo confiável do servidor), ou exige claim service_role E aceitação pelo
endpoint administrativo Auth. O claim não constitui autorização sozinho.
Guards assertCallerRoleOnRow/InCompany são para utilizadores; este remetente
é exclusivamente máquina/service-role, não passa a autorizar utilizadores.

`src/test/capi-v2-auth.test.ts` importa o helper e handler reais. Uma chave
HMAC efémera é gerada localmente: o Auth simulado valida criptograficamente
a assinatura, nunca aceita apenas o claim. Nenhuma chave/credencial Cloud é
lida. Ausência de token, anon/user assinados, token inválido e service-role
forjado → 401 service_role_only em health/dry_run/send ANTES de corpo/RPC/
tabelas/configuração/efeitos. Controlo positivo assinado → aceito após Auth;
chave exata local → aceita sem fetch; Auth 403/indisponível → false.

Alias Vitest e declaração ambiental usam os tipos reais do SDK, sem any shim;
contrato Deno limitado a env.get para os testes do helper já existente.
Não há promessa de prova hospedada: nenhuma chamada Auth/Graph real nem deploy.

## Comandos e resultados reais

```text
bunx vitest run src/test/edge-fn-guard.test.ts
ANTES: Test Files 1 failed (1); Tests 1 failed | 3 passed (4); exit=1
Falha: capi-v2-send: sem_identidade, src/test/edge-fn-guard.test.ts:34

bunx vitest run src/test/edge-fn-guard.test.ts src/test/capi-v2-auth.test.ts src/test/capi-v2.test.ts src/test/capi-p1-guard.test.ts src/test/capi-diag-no-secrets.test.ts
DEPOIS: Test Files 5 passed (5); Tests 67 passed (67); exit=0

bunx vitest run
Execução 1: Test Files 2 failed | 190 passed | 2 skipped (194)
Tests 1 failed | 1621 passed | 15 skipped | 11 todo (1648); exit=1
newgang-crm-profile-fields: hook timeout 10000ms
issue333-checkpoint66: test timeout 5000ms

bunx vitest run src/test/issue333-checkpoint66.test.ts src/test/newgang-crm-profile-fields.test.ts
Test Files 2 passed (2); Tests 27 passed (27); exit=0

bunx vitest run
Execução 2: Test Files 3 failed | 189 passed | 2 skipped (194)
Tests 2 failed | 1620 passed | 15 skipped | 11 todo (1648); exit=1
Mesmos timeouts e issue333-proof60: deadline em vez de fingerprint mismatch.
Não alterados; CI410 reportada pelo controller tinha estes testes PASS.

git diff --check
exit=0

Harness automático (não executado manualmente):
2026-10-19T04:13:21Z — build OK (tipos/compilação sem erros).
Entrada anterior 04:12:01 teve erros de resolução npm/Deno no novo teste,
resolvidos com alias para SDK real e declaração env.get.
```

Suite padrão local NÃO verde; canário de rede não executado (limites zero
chamadas reais). CI GitHub final depende do controller; suite isolada e
harness não certificam CI verde nem autorizam retoma #333/Publish.

## Ficheiros consultados

docs/INDEX.md; docs/QUADRO.md (incluindo #329); AGENTS.md (não alterado);
docs/estado/estado-crm-portal-e-leads.md; docs/features/capi-p1-erp.md;
docs/features/capi-v2-consentimento.md; docs/testes/issue322/capi-v2.md;
.lovable/memory/security/multi-tenant-edge-functions-audit.md;
.lovable/memory/security/edge-functions-verify-jwt.md;
capi-v2-send/index.ts e handler.ts; _shared/multiTenant.ts;
scripts/edge-fn-guard-lib.mjs; edge-fn-guard.test.ts; capi-v2.test.ts;
vitest.config.ts; src/types/deno-zod.d.ts; roadmap.md.

## Limites e próxima ação

Zero Cloudwrites/DDL/migrações/deploy/Publish/crons/Meta/provedor real/
segredos/documentos reais. Não repetir limpeza81/83; resíduos manuais adiados.
Libertada somente subreserva corretiva ChatGPT; restante #322 não assumida,
#323/#333 e AGENTS raiz preservados. Controller confirma novo HEAD integrado
e CI quality antes de próximo dispatch não corretivo ou Publish.