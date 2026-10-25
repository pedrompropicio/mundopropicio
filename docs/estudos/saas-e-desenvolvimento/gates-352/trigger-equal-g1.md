# #352 — trigger_equal e auditoria de policies; G1 interrompido por referência ausente

24/10/2026, 21:35 Fortaleza (25/10/2026, 00:35 UTC). Executor Codex; revisão Claude por leitura. R0 no privado. Sem consulta/escrita Live, DSN, infraestrutura paga, deploy ou Publish.

## Resultado

G1 **vermelho**: 107 entradas concluídas (60 ledger + 47 órfãos), 108 tentadas, 1 falhada e 1.344 não tentadas das 1.452. Nenhuma Drizzle alcançada. G2 **não executado**, condicionado a G1 verde. O catálogo local exportado é parcial, não é um diff de Live.

[Run 40147085300](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40147085300), [código 71771d82](https://github.com/pedrompropicio/mundopropicio-replay/commit/71771d82cbc0c91fc5dc7364a6c7ad5909511130), [artefacto privado](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40147085300/artifacts/12580938527). SHA256 do ZIP: `7128c477834aec34299078e3763d02afd31960f46258c3d46289aed6bde3a83d`, reconferido após download. Fonte pública fixada em ad160ee9; nenhuma migração, overlay ou plan.json alterado nesta etapa.

## Regra e testes

42710 em CREATE TRIGGER só é saltado após rollback do savepoint e SELECT em pg_trigger por nome e tabela. pg_get_triggerdef e statement passam pela normalização autorizada: espaços colapsados, remoção de public. e aspas, comparação sem distinguir maiúsculas. O delimitador terminal `;` é removido da representação do statement porque não pertence ao texto devolvido por pg_get_triggerdef. Igualdade e ambos os textos normalizados ficam em ledger/skipped-idempotent.json, variante trigger_equal. Definição diferente ou qualquer outro erro não coberto interrompe a versão.

25 testes unitários PASS; teste local PGlite dos três casos PASS. No Postgres nativo Supabase/Docker: 14 autotestes anteriores, 1 caso using_index real e os 3 testes trigger_equal PASS (real salta; AFTER/BEFORE pára; função diferente pára). As fixtures nativas de triggers são revertidas antes do replay. PII gate verde; cron.launch_active_jobs off e firewall activos; 0 crons antes e depois do unschedule.

## Saltos

47 destrutivos em 4 ficheiros; 256 idempotentes em 19 ficheiros: 219 base, 28 using_index e 9 trigger_equal. Todos pertencem a versões concluídas. Listagem integral com ficheiro, linha, SQLSTATE e hashes no [anexo](trigger-equal-g1.json). Os textos SQL/definições completos ficam no artefacto privado, incluindo ledger/skipped-destructive.json e ledger/skipped-idempotent.json. A igualdade dos nove triggers foi provada no momento do salto; equivalência final com Live ainda não medida.

## Primeira falha não coberta

`orphan/20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql`, versão 20260408095142, INSERT iniciado na linha 3; SQLSTATE **23503**, objecto public.account_categories, constraint account_categories_parent_id_fkey. O INSERT depende de uma categoria-pai ausente. A linha 5 contém a primeira referência reportada. A versão inteira foi revertida. Não é uma falha de runner nem o caso companies/slug; não pode ser saltada pelas regras idempotentes/destrutivas.

Proposta para revisão, **não aplicada**: definir o seed oficial de referência e a sua posição antes destes INSERT, a partir de prova de origem e dependências do plano de contas. Não inventar raízes/UUIDs nem retirar este INSERT de referência sem decisão. A autorização anterior deixou seed/G3 fora do âmbito; nenhuma expansão foi feita.

## Auditoria retrospectiva de policies

114 instruções CREATE POLICY saltadas por 42710, deduplicadas por ficheiro/índice, incluindo os saltos do run anterior e deste run. **98 iguais, 16 diferentes, 0 erros de auditoria.** Comparação contra o catálogo LOCAL ao final desta execução parcial. As definições esperadas são canonicalizadas com policies de nome temporário numa transacção local explicitamente revertida; comparação de polqual/polwithcheck via pg_get_expr, roles, cmd e permissive. Isto não compara o estado no instante de cada salto nem prova drift em produção.

Das 16 diferenças, 12 são policies ausentes no estado final local com DROP posterior identificado abaixo; quatro têm expressões diferentes (permissão editor no statement saltado, ausente na expressão final local). Requerem revisão da sequência antes de concluir equivalência; não foram corrigidas automaticamente. Valores completos actual/expected no artefacto policy-skip-audit.json; o anexo público contém campos divergentes e hashes.

| Origem | Policy | Diferença / evidência posterior |
|---|---|---|
| 20260321021238 L26 | Recurring transactions manageable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260321120543_2bf0d18d-3272-4892-a450-e75716b984e0.sql L90, ledger/20260321132341_20260321132339_publish_migration_from_pg_dump.sql L214 |
| 20260321132341 L54 | Cache deductions deletable by admin or manager | Ausente no catálogo final; DROP posterior: orphan/20260323131805_cdf09178-b070-41aa-ba31-077cc7e8c401.sql L2, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L11 |
| 20260321132341 L100 | Event forecasts insertable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L108, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L25 |
| 20260321132341 L106 | Event forecasts updatable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L118, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L27 |
| 20260321132341 L178 | Quotations insertable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L28, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L82 |
| 20260321132341 L184 | Quotations updatable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L38, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L84 |
| 20260321132341 L202 | Recurring transactions insertable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L48, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L98 |
| 20260321132341 L208 | Recurring transactions updatable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L58, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L100 |
| 20260321132341 L246 | Suppliers insertable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L68, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L114 |
| 20260321132341 L252 | Suppliers updatable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L78, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L116 |
| 20260321132341 L336 | Transactions insertable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L8, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L130 |
| 20260321132341 L342 | Transactions updatable by authenticated | Ausente no catálogo final; DROP posterior: orphan/20260323123335_75b7c209-dbb9-4570-b1bf-9508c6e660eb.sql L18, ledger/20260323132127_20260323132124_publish_migration_from_pg_dump.sql L132 |
| 20260323132127 L13 | Event forecasts insertable by privileged roles | Expressão final só admin/manager; statement saltado inclui editor. |
| 20260323132127 L19 | Event forecasts updatable by privileged roles | Expressão final só admin/manager; statement saltado inclui editor. |
| 20260323132127 L29 | Events insertable by privileged roles | Expressão final só admin/manager; statement saltado inclui editor. |
| 20260323132127 L35 | Events updatable by privileged roles | Expressão final só admin/manager; statement saltado inclui editor. |

## #329 e fecho

Merge normal anterior concluído em af30232d, pais aacd6eed/b8df9308; backup lovable-sync-1792883945 mantido como evidência, sem restauro nem merge do backup. Cronologia registada na #329, comentário 6390933899. Nesta retoma: GitHub=Lovable=5a7e2c45 e agentFinished=true imediatamente antes da reserva eb279fbb. Regra permanece: reconfirmar os dois HEADs e agente livre imediatamente antes de cada push público, com expected_sha; preservar alterações concorrentes.

A reserva desta etapa é libertada no commit de fecho. #352 permanece aberta; G6 continua com Pedro. Próximo passo é revisão do Claude sobre o seed de referência e as quatro diferenças de expressões, não criação de homologação.
