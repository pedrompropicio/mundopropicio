# Prova71 — transporte estrito integrado localmente aos checkpoints

HEAD de entrada observado `ead65094e1ed5809c804d9e54a4da6e7a0ff2f09`, igual ao comunicado pelo Pedro. Âmbito18/10/2026 18:52UTC LOCAL/ISOLADO. Zero consultas/escritas Cloud, contas/login/sessões Cloud, allowlist/faturas Cloud, DDL/deploy/Publish. Contas59/63 não usadas; artefactos preservados. #323/DECISIONS/AGENTS intactos. Fases1–7done,8PARCIAL,9–18pendentes.

## Integração concreta

`controller-checkpoint71.ts` usa request69/receiver69 estritos. Consulta prepara request+contract privado0600 e termina com checkpoint/controller_select: nenhum SELECT/timer/polling pendente. Controller entrega JSON.stringify direto de structuredContent.rows, com bytes/hash upstream independentes; comparação antes do consumo. Id/query/fingerprint/schema aninhado exatos, uma linha e rowCount1, UTF8/64KiB, duplicata/cancelada/tardia/fora de ordem recusados. Hash não é assinatura/prova criptográfica da origem.

Por etapa e método, pedidos e valores completos persistem em journal privado. Retoma importa contexto, continua método interrompido e não repete métodos já concluídos. Login e operações Auth são marcadas started antes do efeito; estado incerto recusa retry. Browser/par execute e check HTTP têm journal interno separado: dados/evidência são persistidos pelo worker antes das guardas, e a conferência SQL pode ser retomada sem repetir HTTP. Token e sessão só em contexto privado, nunca outputs; fecho apaga secrets/journals privados de métodos e remove contexto do checkpoint, mantendo PDF/evidências. Pausa/falha não recria identidade. Cleanup conserva ações pendentes e verifica sessões/baseline independentemente. Nunca uma conta em prepare/resume.

`run-cloud57.ts` deixou de importar OfficialSelect66/default CLI. Default antigo agora recusa; relay57 com timer permanece apenas artefacto/teste histórico, não ligado à entrada por checkpoints. SQL textual69 permite separadores dentro de string literal revista (notas FICTITIOUS); não é parser/sandbox SQL, usar somente constantes revistas e conector read-only. SQL necessário foi efetivamente executado no PostgreSQL local. Entry ainda exige autorização por etapa/ambiente AuthAdmin: esta integração NÃO libera piloto.

## Bundle real, não executado no Cloud

`pilot8/bundle71/` contém três contratos JSON version1/id/query/fingerprint/expectedKeys/schema/maxBytes e instruções concretas. `bundle71-cli.ts` é somente prepare/receive local, não executa SQL ou Auth.

- metadata0001: catálogo de colunas, cinco hashes de funções, contagem allowlist ativa num snapshot. Query3463bytes; estimativa envelope16KiB; fingerprint `86990cf6ad3d313471a0c133e5edad9571155e93c7ba55077a9e230dbf568d2e`.
- baseline0001/0002: mesma query3343bytes, dois snapshots independentes intencionais; estimativa32KiB cada; fingerprint `c32cca4b733fccfdef7ab46cd8257ce1359b03abecb1091fa72fca97bd33d34f`.

Baselines globais sem sentinel/filtro de owner, quinze relações count+hash, fontes/ACL/config/owners funções, flags/count allowlist. Nenhum conteúdo individual ou dado pessoal devolvido, nenhum corpo de função de aplicação invocado. Arrays/payloads limitados pelo envelope64KiB; se exceder, recusar e propor redução necessária, não chunks. Estimativas não são medição Cloud nem garantia de tempo; string_agg/hash percorre os dados. Catálogo atual testa colunas presentes, não é auditoria completa de tipos/RLS/índices/buckets. Bundle identity-free não inventa prova de identidade futura.

## Comandos/resultados locais

```text
bunx vitest run src/test/issue333-controller-message69.test.ts src/test/issue333-controller-checkpoint71.test.ts src/test/issue333-checkpoint66.test.ts src/test/issue333-private-cloud57.test.ts src/test/issue333-baseline58.test.ts
5 files PASS, 58 tests PASS
PILOT8_MARKER=issue333-pilot8-71717171717171717171717171717171 bunx vitest run --config docs/testes/issue333/pilot8/driver58.config.ts
1 PG/React/Chromium integrated test PASS
bunx tsgo -p docs/testes/issue333/pilot8/tsconfig66.json
exit0, no diagnostics
build harness latest observed 2026-10-18T19:02:18Z: build OK
```

PG test exécuta o bundle e todos SELECTs reais do driver em PostgreSQL descartável; fake controller só responde ENTRE invocações completas sem relay. Chromium página React real + handler SQL locais e doubles Auth/Storage: um login local, dois execute mesma prévia, um resultado/fatura simulada, downloadSHA, revoke local, checkHTTP200/conferido, logout/ban/sessões0, financeiro0. Não é Cloud real. Worker evidencia browser.json/par HTTP reais locais. 18 testes71 incluem5cenários executor+receiver/controller success/expired/worker/logout/ban, pausas15min por clock local sem atividade, HTTP único via journal, schemas/hash/bytes/oversized/canceladas e falha incerta. Receiver69 fornece ordem/concorrência/duplicata adicionais. Nenhuma espera real de15min alegada.

Falhas iniciais locais corrigidas: marcador local não definido; proowner chega string OID e foi preservado com schema explícito; semicolons da nota literal recusados indevidamente; token persistido novamente após suspensão; readiness não deve ser repetida depois do login. Logs completos locais `/tmp/issue333-proof71-{pg,final,dynamic,types}.log`; não são evidências Cloud.

## Próximo único passo

Controller validar os três envelopes do bundle real read-only conforme README. Conferir fonte/flags/estabilidade dos snapshots; responder com bytes/hash upstream e sem reconstrução manual. Depois apresentar prontidão e plano de UM piloto, incluindo meio autorizado de AuthAdmin; nenhum piloto autorizado/executado agora. NÃO medir150KiB/chunks/mais sintéticos. Fase8PARCIAL; CI/GitHub novo HEAD não confirmados. Reserva333 libertada no fecho.