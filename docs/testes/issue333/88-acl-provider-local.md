# Tarefa88 — correção pontual ACL/rollback, LOCAL e INERTE

Base GitHub/Lovable confirmada igual: `8cb9968566d5507a777315415ff841abff6e5157`. Controller confirmou agentFinishedtrue e CI413 run39245149542 quality118035152089SUCCESS (types/vitest/canário/build) antes deste dispatch corretivo. Lidos INDEX/QUADRO/AGENTS raiz/memória333; reservas322Claude/323 preservadas.

## Causa e menor ajuste
GRANT SELECT não subtrai permissões já criadas por default privileges. PostgreSQL local com criadorpostgres e `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role` reproduziu a falha: INSERT autorizado, teste negativo exit1. Catálogo antes continha DELETE/INSERT/UPDATE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN e SELECT em ambas as relações.

Correção do candidato: REVOKE ALL de PUBLIC/anon/authenticated/service_role antes do GRANT SELECT nas duas relações; REVOKE também service_role na função antes do GRANT EXECUTE. Nenhuma alteração a default privileges globais ou ACL legada. Uma barreira transacional de catálogo verifica ownerpostgres, RLS, ACL explícita mínima e sem grant options, direitos efetivos de leitura/escrita, owner-authority e EXECUTE/search_path/SECURITY DEFINER. Se herança inesperada mantém escrita, aborta o candidato inteiro; não revoga grants de outras roles para contornar.

Após: service_role apenasSELECT nas duas relações; função `{postgres=X/postgres,service_role=X/postgres}`. Ownerpostgres conserva autoridade inerente, não é tratado como revogado. Roles normais não-superuser; service_role BYPASSRLS real no cluster. PUBLIC verificado no catálogo e por rolepublic_probe sem grants. Teste adicional defaultsALL para PUBLIC/anon/authenticated também passa. DefaultsALL permanecem no catálogo do cluster: candidato não os alterou.

## Provas PostgreSQL reais
Runner opt-in separado: `ISSUE333_LOCAL_PROOF=1 bunx vitest run --config docs/testes/issue333/provider87/vitest.acl88.config.ts`.
- Antigo: mesmo teste de privilégio falha com INSERT=true, exit1; outros casos não selecionados pelo `-t`, não prova de execução deles.
- Corrigido final:6PASS,exit0. DML INSERT/UPDATE/DELETE e TRUNCATE realmente executados como service_role recusados42501 em ambas as relações; reopen direto recusado. SELECT audit/readRPC legítimos funcionam; pauseRPC legítima persiste revisão2/denied_provider+audit.
- anon/authenticated/PUBLIC-probe: SELECT/RPC reais recusados42501, demais privilégios negados por catálogo; owner/search_path/RLS/ACL verificados.
- Herança real local: grantUPDATE por inherited_writer+membership para service_role. Sem barreira, UPDATE permanece efetivo apesar de REVOKE direto e reabre a linha de teste. Com barreira, erroanalysis_control_acl aborta o candidato. Membershippostgres também é detectada e rejeitada. Não afirmar eliminação de privilégios do owner/inheritedgrants.
- Regressões selecionadas do runner87:2PASS (ACL e rollback),exit0;18casos não selecionados deliberadamente, sem repetir bateria anterior.

Sem browser/PGexterno/documento/provedor/ERPfixtures; cluster socketUnix descartável usa utilizador OS1000 existente. Roles/linhas técnicas são exclusivamente desse PostgreSQL local; sem AuthCloud. Opt-in ausente é erro, nunca skip silencioso. CIdefault não exige PostgreSQL nem inclui estes runners.

## Rollback seguro proposto
Continua artefacto INERTE. Lock/recusa se claimpendente mantidos. Fecha configuração, acrescenta revisãoauditclosed e remove apenas RPC/controlo. Audit permanece IN PLACE com todas as linhas/bytes anteriores e ACL restrita; nenhum DROP audit/exportação presumida/cópiaCloud. Teste compara todas as linhas antigas integralmente, verifica nova linha closed e DELETEaudit service_role recusado. Reset DROPaudit no teste87 é explicitamente destruição do cluster descartável, não parte do rollback.

Não é reversão para reutilizar cegamente o mesmo CREATE TABLE: audit retida exige futura revisão de reinstalação. Sem mecanismo de eliminação autorizada desta trilha nesta entrega.

## Artefactos e validação
SQL completo corrigido: `supabase/manual/issue333_tarefa87_provider_control.INERTE.sql` e `...ROLLBACK-INERTE.sql`. Teste88/config em `docs/testes/issue333/provider87/`. Diff específico desde base8cb9968: `88-diff.diff`; hashes/fontes: `88-hashes.sha256`; outputs integrais antes/depois/regressão: `88-outputs.md`.

Histórico87/diff87/hashes87 NÃO regenerados: referem candidato anterior e permanecem evidência histórica, não certificação das ACL atuais. Prova88 supersede apenas ACL/rollback. Gatesupload/analysis/providerfalse e módulosprovider inalterados. Nenhum ficheiro runtimeDeno alterado, logo não repetido bundle/runtime/provider.

Harness build automático observadoOK após alterações (11:40:57UTC). Typecheck do NOVO SHA sem output separado nesta tarefa; CI413 typesPASS certifica somente base8cb9968. Controller deve confirmar types/canário/build/quality no novoSHA. Nenhuma alegação de CIGitHubverde desta entrega nem suite completa repetida sem nova falha.

ZeroCloudquery/write/DDL/DML/deploy/Publish/ativação/crons/pagamentos/segredos/AuthStorage/documentoreal/fixtureERP. #322CAPI/portal-track/testes70worker60/#323/AGENTSraiz/DECISIONS preservados.8PARCIAL/9não liberada/10PARCIAL; limpeza manual adiada.

## Próximo passo
Controller revê SQL completo/diff/hashes e barreira ACL/owner/memberships antes de escolher númeroLive sem colisão; aplicação exige autorização própria e validação em ambiente alvo. Sem aplicação neste turno. Confirmar HEADintegrado/CIqualitySUCCESS antes de próximo dispatch não corretivo/Publish. Só subreserva88 libertada no fecho.