# #475 — preparação interrompida: provas da fonte, sem candidato de aplicação

Base local: `d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16`, igual à base do despacho; árvore inicialmente limpa. Autorização fornecida até 02/11/2026 09:59 UTC; início local 05:52 UTC. CI da base `41395967116 success` é informação do despacho, não verificação remota. Nenhum serviço MP, catálogo real, credencial ou rede MP foi consultado.

## Resultado e bloqueio

**Entrega funcional não concluída. Não existe correção preparada nem migração candidata.** Parei a parte de implementação por não conseguir garantir integralmente preservação de vínculo BP, guardas e protocolos de concorrência exigidos no despacho. Os achados abaixo são evidências da fonte versionada e de fixtures, não prova de vulnerabilidade instalada nem impossibilidade técnica de corrigir a RPC. Não apresento uma troca isolada da fórmula como cumprimento do contrato integral.

A fonte mais recente encontrada já preserva `operation_key`, ausente na fonte indicada inicialmente. Contudo, a lista de INSERT das irmãs não contém `forecast_id`; a 0297 usa esse campo como vínculo canónico. O teste demonstra a omissão na ausência de triggers adicionais, não afirma o resultado instalado. A memória de vínculo BP ainda afirma que esse campo não existe: também não é contrato atual suficiente. Não alterei regras #413/#404 nem escolhi uma herança nova para colmatar a lacuna.

A fonte autoriza por `has_role`/`has_permission` na empresa ativa e seleciona a TX apenas por ID sob SECURITY DEFINER; falta comparação com `v_tx.company_id`. No fixture com helpers versionados e gestor exclusivamente da empresa A, a chamada direta como `authenticated` modifica a TX da empresa B. O ator tem identidade de sessão alterada (`SET SESSION AUTHORIZATION authenticated`), não apenas SET ROLE a partir de superuser. A RPC é propriedade de postgres no fixture; o caller não recebe privilégios nas tabelas. O teste não certifica owner/ACL/RLS instalados.

## Leituras

Lidos INDEX, AGENTS raiz/supabase, QUADRO (execução e frente 4), estado financeiro, PROC-promocao e relatório `parcelas-original-20261102.md`. Pesquisados docs e `.lovable/memory/features/`; consultadas `transaction-installments.md`, `transactions-bp-linkage.md` e `payment-amount-invariants.md`. Modelo B da memória está desatualizado; #298/Modelo A e guardas #471 permanecem intocados. O despacho prevaleceu sobre atualização documental geral do ritual: INDEX/QUADRO/estado/AGENTS não foram alterados.

## Inventário das fontes SQL

Pesquisa textual de todos os ficheiros SQL em supabase e drizzle encontrou cinco ficheiros contendo a assinatura/nome, todos com CREATE OR REPLACE; não foi encontrada alteração/grant adicional da RPC nesses dois históricos. Os hashes seguintes são SHA-256 dos ficheiros completos (não `pg_get_functiondef`):

| Fonte | SHA-256 |
|---|---|
| `supabase/migrations/20260831150444_c88835a6-3dc9-480d-8781-f8adb04d46b2.sql` | `d158ff52eccef2c4d059056b95f27f1bf5efa045a40711894f034b3739420bd8` |
| `supabase/migrations/20260831175623_0376acd1-9d2d-4e46-a9d7-637eccb2ba49.sql` | `7d866c5bdac9096d586b60160a59be774c4e097e7d562778838495644cafae1e` |
| `supabase/migrations/20260831184212_4dcc5d22-8bc7-4bb1-8561-67c60f614e4b.sql` | `07f19420206e22af02b4e843f0549b451e553e943d138b1b61752d697eaa556c` |
| `supabase/migrations/20260831184500_renegotiate_block_split_parent.sql` | `a8b33daa2cda4f193d332fc3245eecdb5e0c430ee97579007b23733e47519e9b` |
| `supabase/migrations/20260912173212_851813b9-a9d0-481a-935e-be25b3f8b9ec.sql` | `4f6fb777161277fecd59f23157ba8d1b7822ecf8531efe38f8d777957eca89c9` |

A primeira fonte cria a RPC e faz REVOKE ALL FROM PUBLIC / GRANT EXECUTE TO authenticated. A segunda acrescenta `manage_transactions` e contém alterações RLS de pagamentos no mesmo ficheiro. As duas fontes seguintes incluem bloqueio de pai rateado e diferem entre si apenas na terminação/espaços. A fonte de 12/09 acrescenta `operation_key` nas irmãs e é a mais recente encontrada nos ficheiros SQL; não se presume instalada. Owner e ACL efetivos da base permanecem desconhecidos.

## Dependências e lacunas de inventário

A RPC lê `transactions`, `transaction_payments`, `partner_paid_expenses`, `partner_advance_expenses`, `events`, e escreve `transactions` e `transaction_audit_log`; usa `auth.uid`, `has_role`, `has_permission`, `gen_random_uuid`. Bloqueia só a TX por FOR UPDATE. O evento é lido sem lock e as exclusões de dependências são EXISTS sem protocolo explícito na RPC. Não foi provada a serialização com escritores concorrentes dessas dependências.

Helpers canónicos consultados: `current_company_id` em `20260608214750_63ab4fa3-11fd-4d1d-a0ee-54380cdf7469.sql`, `has_role` em `20260515013743_a0e44697-fa1d-4832-8287-996a3220c035.sql`, e `has_permission`/`has_permission_in` em `0115_derp254_permissions_per_company.sql`. `0070_derp221_sepa_guard_planned_installments_split_bp.sql` mostra autorização por empresa da TX e recusa estrutural pai/filhas; não foi transplantada nem reativado Modelo B.

Triggers relevantes localizados/consultados incluem herança BP `inherit_house_only_from_forecast` / propagação (0297), guardas de exclusão e selo (0296), congelamento de participantes/extras (0270), L2 e deriva de pagamentos descritos nas memórias. **Este inventário de dependências/triggers/ACL não é exaustivo nem uma identidade de catálogo apta a instalação.** Falta reconciliar corpos, owner, proconfig, ACL, dependências dinâmicas, constraints, triggers e protocolos de locks. Nenhum preflight ou rollback parcial foi apresentado como seguro.

## Prova SQL sintética

`src/test/issue475-source-blockers.test.ts` executa o corpo real da RPC de setembro em PGlite em memória, sem mock do writer, com tabelas sintéticas mínimas e sem triggers de produto. Helpers de empresa/papel/permissão são lidos dos ficheiros versionados; auth.uid e is_platform_admin são adaptadores SQL sintéticos para as tabelas do fixture. A ACL da RPC reproduz explicitamente o grant da fonte inicial, não uma ACL instalada presumida.

- Original líquido BRL 100.01, bases EUR [1,1,1], amount=3 e FX 0.17/manual: soma persistida 100.02; o original não é reconstruído por EUR×FX.
- O mesmo cenário conserva operation_key nas três TX e forecast_id em apenas uma.
- Chamada direta como gestor de A contra TX de B cria três TX em B; a identidade de sessão é efetivamente authenticated durante a chamada.
- CHECK sintético que impede INSERT de irmã faz falhar o SQL real e conserva amount=3, original_amount=100.01, grupo NULL e auditoria vazia.
- CHECK sintético que impede auditoria faz falhar o SQL real e conserva os mesmos valores e ausência de logs.

São quatro testes; o primeiro reúne soma e metadados. Não são testes de aceitação de uma correção. Não foram executados os cenários completos de maiores restos/limites/BRL/USD/GBP/EUR/IVA/guardas sobre candidato, pois não existe candidato. Não houve teste de concorrência multi-sessão, nem simulação de concorrência com mocks. A prova de rollback vale para a fonte no schema sintético, não para o conjunto instalado de triggers.

## Verificações finais

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0.
- Recorte `bunx vitest run src/test/issue475-source-blockers.test.ts`: quatro testes aprovados, sem skips; 2,93 s na execução estável. Duas tentativas anteriores do fixture falharam ao restaurar a identidade da sessão PGlite; corrigido para SET SESSION AUTHORIZATION postgres no finally (RESET SESSION AUTHORIZATION nesse ambiente conservava authenticated). Nenhuma alteração ao writer de produto.
- `bunx vitest run`: exit 0; 339 ficheiros aprovados, dois skipped; 3377 testes aprovados, seis skipped e 11 todo existentes; duração 184,58 s. Nenhum skip, timeout ou limite foi introduzido/afrouxado. Não houve execução integral anterior às alterações: os resultados da #471 são contexto documental, não baseline medido nesta sessão.
- `bun run build`: exit 0; Vite em 53,74 s, PWA gerado; avisos existentes de Browserslist/chunks, sem alterar configuração/dependências.
- `git diff --check`: exit 0. HEAD continua na base autorizada. CI remoto do diff não foi executado/verificado.

Logs transitórios do runner: `/tmp/issue475-vitest.log` e `/tmp/issue475-build.log`; os resultados relevantes estão registados acima e não dependem da retenção desses logs.

## Gates que continuam abertos

0305 estava livre e não foi criada. Faltam candidato SQL real, cópia byte-idêntica, rollback condicionado à identidade base/candidato e preflight fail-closed. Faltam matriz de preservação e provas completas, incluindo concorrência real e rejeições de acesso do candidato. Catálogo instalado permanece desconhecido; homologação, revisão pelo 0, CI do diff, janela e autorização de aplicação permanecem gates posteriores. Nenhum teste Live, aplicação SQL MP, ledger, deploy, Publish, DML real, backfill, alteração cliente, commit/push ou merge foi realizado. #457 não está encerrada e não se afirma Brasil pronto. A trava estrangeira #471 permanece intacta.
