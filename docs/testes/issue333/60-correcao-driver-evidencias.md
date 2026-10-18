# Prova60 — correção do executor de testes e evidências (fase8 PARCIAL)

Data: 2026-10-18 ~16:12 UTC. HEAD Lovable: 71c63deee4e3e324b79486531429e0db4a022013.
Escopo: SOMENTE executor de testes e evidências locais/isoladas. Zero contas, logins, sessões,
faturas, DML/DDL Cloud, deploy ou Publish nesta entrega. Fixture piloto59 permanece
revogada/banida; artefactos e PDF preservados.

## Lacunas da prova59 tratadas

1. browser.json não gravado quando um guard final falhava (asserts antes do write).
2. Statuses HTTP das DUAS respostas execute da mesma preview perdidos (guardados em
   `args`, que nunca sai do worker).
3. Relay SELECT aceitava resposta sem id, sem fingerprint da query e sem schema
   esperado — o campo ausente na sequência 0011 degradou para leitura errada.
4. Check autenticado pós-revogação não exercitado na prova59.

## Alterações

- `pilot8/cloud-browser57.py`: evidência `browser.json` gravada ATOMICAMENTE
  (tmp + os.replace) num bloco `finally`, antes de qualquer guard final e antes do
  teardown do browser. Statuses e corpos sanitizados (só chaves status/error) das
  duas respostas execute capturados em variáveis locais (`evidence['pair_statuses']`,
  `evidence['pair_bodies']`), nunca em `args`. Falha real registada sanitizada
  (`{type, stage}` via `sanitize_error`) — nunca texto de transporte com headers.
  Guard novo: pair_statuses obrigatório antes do read-only check.
- `pilot8/private-cloud57.ts` (`OfficialSelectBridge.select`): resposta exige
  (a) `id` exatamente igual ao pedido, (b) `fingerprint` = sha256 da query enviada,
  (c) payload objeto-linha não nulo, (d) todos os campos de `expectedKeys`
  presentes — campo ausente é REJEITADO, nunca vira PASS. Resposta trocada,
  stale ou com shape "revoked" é rejeitada com erro explícito.
- `pilot8/run-cloud57.ts`: todas as chamadas `select` passam o schema esperado
  (preflight, baseline, readiness, fact, revoked, n, incompatibilities).

## Testes (locais, isolados, sem Cloud)

- `src/test/issue333-proof60.test.ts` (5 novos): relay aceita só id+fingerprint+
  schema completos; rejeita id trocado / fingerprint errado / campo ausente
  (shape 0011) / payload escalar; timeout sem resposta; contrato estático do
  worker (write atómico em finally, pair statuses locais, erro sanitizado,
  assert de pair antes do check).
- `src/test/issue333-private-cloud57.test.ts` e `src/test/issue333-baseline58.test.ts`
  atualizados para o novo contrato do relay (resposta com id+fingerprint).
- Suite completa: 1458 passed, 1 skipped, 11 todo, 0 failed.

## Cobertura comprovada vs lacunas Cloud restantes

Comprovado localmente: rigor do relay, persistência atómica de evidência, captura
do par HTTP, sanitização de erro, orchestration guards (future-runner, 5 testes),
AuthAdmin HTTP exato (create/logout/ban), PDF exato 1517B antes de conta.

NÃO comprovado (lacunas honestas, sem simulação):
- Execução real do worker Chromium contra Cloud com o novo formato de evidência
  (a prova59 correu com o formato antigo; browser.json/pair_statuses ficaram por gravar).
- Check autenticado pós-revogação contra o endpoint real (local passou; Cloud não).
- Nenhuma resposta HTTP Cloud foi inventada ou reconstruída nesta entrega.

## Complemento mínimo futuro (proposto, NÃO executado)

Reexecutar o piloto único com este driver corrigido, apenas mediante nova autorização
expressa do Pedro, produzindo browser.json com pair_statuses e o check pós-revogação
real. Sem nova conta sem essa autorização.

## Estado

Fases 1–7 concluídas (inalteradas). Fase8: PARCIAL (piloto59 executado com
certificação parcial; driver corrigido nesta prova60; reexecução pendente de
autorização). Fases 9–18 pendentes.

## Errata (prova61, 2026-10-18 ~16:26 UTC)

A secção "Cobertura comprovada" desta prova60 classificou como comprovadas a
persistência atómica de evidência, a captura do par HTTP e a sanitização de erro
do worker — mas os dois testes desses pontos eram ESTÁTICOS (liam o código do
worker). Essa classificação estava excessiva e é aqui corrigida: na prova60
essas propriedades estavam apenas verificadas estaticamente. A comprovação
dinâmica (Chromium real + doubles isolados, falha antes/depois do par HTTP,
falha parcial do par, guarda pós-par) foi entregue na prova61. Também o SQL do
preflight e a tipagem do driver não estavam validados por execução/typecheck
explícito na prova60 — corrigido na prova61.
