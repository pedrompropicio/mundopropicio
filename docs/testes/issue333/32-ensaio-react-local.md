# #333 — Prova32: conclusão local dos casos concretos

Janela 00:23:13 UTC respeitada: até essa hora só leitura e /tmp. HEAD3728a702 e checkout limpo confirmados imediatamente antes da reserva. CI39081959443 anterior success confirmado pelo controlador; nova CI pendente. Executor único, sem subagentes ou GitHub writer; #323 intocada.

## Resultado e âmbito
Casos bloqueantes pedidos executados e PASS em Chromium real com páginas React produtivas: DataEntryDialog, StandaloneInvoiceScanner, AccountantStandaloneInvoicesTab, StandaloneReservedExecution. SQL0190–0192 byte-exato, PostgreSQL17/pgcrypto real, duas conexões/locks e disco persistente. Nenhum Cloud chamado. Flags true só na cópia. Auth/token/contexto e StorageAPI são fronteiras HTTP locais simuladas; mutação/audit/idempotência/SQL e bytes não são simulados. OCR preparado é fronteira local declarada, IA indisponível.

## Matriz concreta — esperado / observado / evidência
- Assistente upload/preenchimento/prévia/efeitos/autorização/check/link: 1 avulsa EUR + documento e audit, 0 financeiro; PASS Chromium+SQL.
- Scanner captura/manual/guardar e editor metadata: clientes/handler/SQL reais; PASS, audit e bytes conferidos.
- authorize perdido e begin perdido: resposta 503 após SQL; consulta apenas, sem sucesso ou reenvio; PASS Chromium e executeAttempt com contagem RPC.
- authorize/begin pendentes com empresa e Auth alterados: nenhum resultado antigo inicia próximo efeito/fallback; PASS quatro percursos Chromium com chamadas contabilizadas.
- confirmação perdida + troca empresa: uma confirmação, família com exatamente dois IDs; descoberta/check read-only; prévia legível do envelope original; original bytes + autorização explícita executa só novo destino; PASS.
- confirmação pendente + troca Auth: zero execute/reconfirm; família original completed + nova prepare, sem fatura nova; PASS.
- snapshot forjado owner/company/id/hash: botão bloqueado; PASS testes de regra. Não pede IDs/hash ao utilizador nem usa formulário anterior.
- perdas reserve/upload/receipt/commit/check, locks/gate depois lock, rowversion, IVA>total, duplicado forte, normalização e v1 EUR/USD/BRL/GBP: regressões integradas/PG mantidas PASS; sem pressupor índice global Live.
- Paginação Chromium em coleção populada: cada página aguardada, cursor real, fim limitado; PASS.

## Correções não deployadas
1. Check devolve snapshot service-side filtrado por owner/empresa/operação/id/hash depois do RPC canónico. Labels de empresa/autor/pagador são opcionais; ausência nunca autoriza efeito.
2. Reserva mostra dados/efeitos confirmados, consulta prepare e confere snapshot novamente; original bytes obrigatórios.
3. executeAttempt para authorized/inprogress/completed só faz check; não repete upload/receipt/begin/commit.

## Infra e primeiras falhas preservadas
Logs de todas tentativas em proof32. Falhas de harness: select Quem pagou pelo nome acessível; remoção inicial incorreta de @import por URL conter ponto-e-vírgula; folha CSS404; espera de snapshot; paginação ainda não carregada; expressão JS de espera; argumento Auth adicional. Corrigidos sem mudar asserts/ACL/guards/skips. Primeira suite conjunta falhou honestamente; últimas suites têm exit real nos logs. Schema/helpers/triggers locais são os da fixture pg/fixture.sql e harness existentes: auth.uid/current_company_id/has_role/my_effective_permissions, receipts, tabelas financeiras mínimas e trigger de falha audit local. Não equivalem schema/Storage/Auth Cloud. Manifestos original/executado/adaptações identificam cada substituição.

## Limites honestos
Local não é Cloud/runtime publicado. Metadata display labels via API Cloud não foi chamada. Sessões Auth são locais simuladas, não autenticação Cloud. Integrações IA/OAuth/Gmail/Drive/banco/BP/bilheteira ficam indisponíveis e fora do primeiro release; não bloqueiam estes casos. Não reivindicar matriz infinita nem idempotência global v1. Suite geral mantém 1 skip+11todo preexistentes; nenhum skip novo. Issue333/reserva abertas; SQL/configJWT/gates/ACL e #323 intactos.

## Proposta única seguinte — NÃO executada
Pedir autorização específica para atualizar somente standalone-attempt-333 com snapshot read-only e recuperação guardada (verify_jwt=true), mantendo todas flags/settings fechadas; certificar check owner/empresa/Auth e zero writes com fixtures já autorizadas. Sem migração nova ou índice global:0190–0192 bastam para esta atualização. Depois, num pedido separado, piloto Cloud mínimo com 1 avulsa fictícia EUR e bytes, scoped por empresa/owner; autorização antes de qualquer flag ou financeiro. Flags são hoje por operação: piloto não é isolável por owner sem uma pequena migração inerte de allowlist e validação própria; não ligar flags globais para contornar isso. Rollback: fechar preparação/execução, conservar candidatos/audits/resultados e voltar à versão anterior; sem DROP/delete/reenvio. Publish é necessário somente para levar as alterações React ao site publicado; não é necessário para deploy isolado do endpoint. Nenhum destes passos foi executado.

## Fecho verificável
Runner final exit0 em /tmp/issue333-head-29p36gir: HEAD26/UI44/PG31/HTTP7/geral1377, tsgo/Deno/build exit0. 1skip+11todo preexistentes; nenhum novo. Memória/índice e reserva12PASS. Snapshot final:30 avulsas fictícias,28audit,102tentativas,4COREresults;0TX/BP/pagamentos/contas/reembolsos. Manifestos incluem páginas/src/lib/clientes e todos handlers usados. Código do produto final idêntico ao da suite; alterações posteriores só docs/memória. CI remota nova aguardando controlador, sem alegar verde.
