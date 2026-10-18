# Prova66 — coordenação por checkpoints, LOCAL/ISOLADA

HEAD recebido fc85908a90e03d1ee2efd59b63128676b563f0f3. Fases1–7done,8PARCIAL,9–18pendentes. Contas59/63 não usadas; ban/revogação da65 preservados. Zero SELECT ou writes Cloud nesta tarefa; nenhuma conta/login/fatura Cloud, DDL/deploy/Publish ou mudança de produto.

## Causa e correção funcional
Prova65: readiness0005 sem resposta, finally0006 aos60078ms; outer300000ms não protege inner60000ms. Não aumentámos prazos nem repetimos piloto. Entrada CLI contínua (`--resume-identity63`/`--authorized-single-pilot57`) recusada antes de transportes. Legacy functions permanecem apenas como regressão local; não são a entrada CLI.

Novos estados privados versionados:
```text
identity_reviewed --prepare--> await_activation [processo termina, sem SELECT pendente]
controller ativa em turno separado
await_activation --execute--> executing [persistido ANTES de login/HTTP]
executing --> await_revocation [contexto/baseline persistidos; processo termina]
controller revoga em turno separado
await_revocation --finish--> checking --> complete
erro --> aborted + ações pendentes; cleanup explícito somente
crash em executing/checking --> cleanup, nunca execute outra vez
```

`checkpoint66.ts`: lock exclusivo por invocação, gravação atómica0600, `/tmp` obrigatório; checkpoint contém identidade/role/created_at exatos, hash do manifesto, baseline/contexto sanitizado e ações confirmadas/pendentes. Password/token separados0600 nunca no JSON/provas/repo. Token privado necessário para check autenticado após revogação, sem segundo login. Falha tenta logout/ban/sessões/baseline independentemente e reporta revogação ao controller sem polling; falha de logout conserva token privado só para cleanup explícito, demais segredos removidos quando logout confirmado.

`connectedDriver58`: revalida schema, cinco MD5, identidade/meta/PDF/full_name/roleId/empresa, flags e baseline por etapa. Depois da ativação exige manager+duas permissões exatas ativas/expiração, NÃO user/allowlist0. Revogada exige as duas disabled e uma fatura; check do próprio lote200/conferido, baseline antes/depois sem escrita. Baseline original importada, nunca reconstruída manualmente. Artefactos fictícios excluídos apenas na comparação das relações protegidas.

`official-select66.ts`: execução oficial `lovable supabase query <SELECT> --json`, contrato upstream read-only confirmado apenas pelo help local (nenhuma invocação Cloud feita). Captura stdout integral em ficheiro privado, envelope id UUID+SHA256(query)+array exato; expectedKeys obrigatórios por consulta. Locks impedem consumo concorrente; respostas consumidas/failed rejeitam duplicadas/stale/tardias. Unknown shape/truncação/JSON inválido falha fechada, sem reconstruir resultados. Captura pode demorar até60s DENTRO de uma etapa automática, nunca durante espera humana. Testado com resposta real de PostgreSQL local, não com CLI Cloud real.

## Comandos e resultados locais
```text
bunx -p @typescript/native-preview tsgo -p docs/testes/issue333/pilot8/tsconfig66.json
exit0, zero diagnostics (drivers explicitamente incluídos)

bunx vitest run src/test/issue333-checkpoint66.test.ts src/test/issue333-worker60.test.ts src/test/issue333-private-cloud57.test.ts src/test/issue333-future-runner.test.ts
37 PASS antes dos dois casos finais adicionais; resultados finais na adenda abaixo

PILOT8_MARKER=issue333-pilot8-22222222222222222222222222222222 bunx vitest run --config docs/testes/issue333/pilot8/driver58.config.ts
1/1 PASS, PostgreSQL descartável real + handler ERP/React/Chromium reais + AuthHTTP doubles locais.
Invocações prepare/execute/finish com NOVOS drivers e stores entre etapas.
Conta criada pelo runner:0; login double1; par execute mesma prévia2; fatura local1 EUR0/IVA0; revogação local2; check200/conferido; sessões0.
Transações/previsões/contas/pagamentos/reembolsos/listas locais0.
git diff --check: exit0
build automático: build OK 18:11:29UTC
```

Cobertura dinâmica: pausa virtual15min depois de prepare e depois de execute sem timers/SELECT pendentes; ativação permite continuação, expiração recusa login; tentativa segundo execute nunca chama worker novamente; fingerprint/schema/identity errados, resposta late/duplicate recusados; falhas login/worker/logout/ban/sessões com evidências independentes; ausência de revogação impede check; check com escrita falha. Worker Chromium real4casos: par200/200, falha parcial com resposta observada preservada/leg falhada sem inventar HTTP, falha antes/depois do par; browser.json atómico sem tokens. Capturas locais preview.png/reopened.png inspecionadas: prévia EUR0/IVA0, resultado “Registado e conferido”. PostgreSQL do teste de transporte é PGlite; integração principal usa processo PG descartável/socket real.

Falhas iniciais dos testes não ocultadas: ambiente jsdom impedia bootstrap PGlite (corrigido para Node); tsgo recusou baseUrl obsoleto (paths relativos); fixture antiga role_id inteiro incompatível com UUID real (fixture local alinhada). Reexecução passou. Nenhuma correção de schema real.

## Limites / futuro NÃO executado
- Cloud não exercitada. Contrato exato de saída CLI/gateway ainda precisa validação read-only em preparação separadamente autorizada; se desconhecido PARA, não transcrever config/ACL.
- Não existe identidade autorizada utilizável:59/63 banidas/marcadores recusados. Nenhum novo piloto/conta autorizado ou proposto como efeito automático; controller deve definir âmbito futuro, nunca reabrir63 implicitamente.
- Fim abrupto SIGKILL não executa finally; estado executing/checking impede repetir. Lock residual exige confirmar processo ausente e remoção local explícita sob revisão; token perdido/expirado impede check e exige cleanup/controller, sem segundo login.
- Pausa humana pode exceder validade do bearer: finish falha fechada+cleanup, não inventa HTTP200. Sem ban na pausa normal await_revocation porque check necessita sessão; ban/logout em abort ou finish.
- Estado/contexto é privado0600, não defesa contra operador malicioso que controla o sandbox. Sem secrets em repo/provas. Não confundir simulações com certificação Cloud.

Comandos futuros por etapa (não executados): `PILOT8_PRIVATE_DIRECTORY=/tmp/<revisto> PILOT8_MARKER=<revisto> bun docs/testes/issue333/pilot8/run-cloud57.ts --checkpoint66=prepare`, depois mensagem separada `--checkpoint66=execute`, depois controller revoga e mensagem separada `--checkpoint66=finish`. `cleanup` somente após falha/crash. Estado inicial identity_reviewed deve vir de identidade+manifesto explicitamente revistos; nenhuma função cria conta em retoma. Não apontar para estado63 encerrado.