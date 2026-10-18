# #333 — Prova 30: execução isolada real, aceitação parcial

Data: 2026-10-18T00:09:16Z. Executor único 0-Cowork/ChatGPT via Lovable; sem subagentes. Base inicial sincronizada 25c36ae8, CI39079446083 confirmado pelo controlador; antecipação da janela autorizada pelo Pedro. Base final exercitada 00746e569c6030230557ecb4e1f280ad4235610a, descendente a3d3689. Autocommits próprios conferidos por ancestralidade/allowlist e hashes de produto, não por SHA futuro. #333 aberta/reservada; #323 intacta.

## Resultado realmente executado
`python3 docs/testes/issue333/run-head-isolated.py` exit0 em `/tmp/issue333-head-9ggwlvqk`.
- HEAD integrado:23/23; UI/clientes:44/44; PostgreSQL tentativas:31/31; endpoint/Chromium:7/7.
- Geral:1373 PASS,1 skip e11 todo preexistentes; nenhum skip novo nem assert relaxado. Não são1373 provas ponta-a-ponta.
- tsgo exit0. Deno check --no-remote exit0 nas3 funções com aliases locais de tipos e strict:false EXCLUSIVAMENTE no harness; não é bundling Cloud nem configuração Deno produtiva.
- Vite build exit0 exclusivamente na cópia; avisos de tamanho/Browserslist preservados. Build automático do checkout separado.
- CI remota da entrega final: por confirmar; CI inicial verde não certifica este harness.

## Componentes reais / fronteiras locais
SQL0190/0191/0192 aplicado byte-exato; PostgreSQL17.9+pgcrypto,2conexões/transações/locks reais. Handlers data-entry/standalone-attempt e entrypoint ingest reais; clientes src/lib e páginas scanner/contabilidade reais, UI integrada em jsdom. Storage é disco persistente com upload/readback/hashes reais, API local substituída. Auth HTTP/token sintético e supabase-js local são fronteiras simuladas identificadas; identidade SQL usa request.jwt.claims local + roles/regras reais adaptadas ao schema mínimo. Chromium real prova OPTIONS→POST HTTP contra handler+SQL locais, NÃO percorre a página React inteira em Chromium. Não há login/Storage/Lovable Cloud testados nesta prova.

Fixture schema: auth.uid local; companies/profiles/roles/permissões/events/standalone_invoices mínimos fictícios; is_platform_admin local; current_company_id e _effective_permissions_for copiados no fixture, não catálogo completo Live. Tabelas financeiras mínimas com forbidden_write BEFORE INSERT/UPDATE/DELETE. Trigger head_fail_audit injetado localmente para rollback. Nenhum helper/triggers/policy Live modificado. SuitePG histórica adaptada só na cópia: UID1000, CORE0190,ATTEMPTS0191+0192; transformações integrais no manifesto. Suite antiga CORE/handler não foi alegada executada nesta retoma.

Cópia mínima sem.env/.git/.github/.workspace/test-reset/credenciais/serviços de deploy; apenas memória/documentação/patches necessários aos testes. Env allowlisted criada de raiz. node_modules partilhado somente como dependência, não configurações ou sessões. Egress de negócio bloqueado pelos adaptadores/tests; não é isolamento kernel/firewall universal. Nenhuma chamada/fixture/DDL/DML/Auth/Storage/deploy/Publish Live realizada nesta retoma; flags true só no banco/handler descartáveis.

## Provas e dados efetivos
Snapshot integral contém25faturas fictícias,5sessões,5documentos,30recibos,6prévias,3resultados CORE,87tentativas,22auditorias,35objetos/hash. Autorizações CORE ficam approved_by/name/time/snapshot_hash em data_entry_results e ledger/observation; não inventar tabela data_entry_authorizations. TX/BP/pagamentos/contas/reembolsos:0 cada, triggers recusam qualquer writer. Estado final inclui corrupção/concorrência proposital dos testes negativos, não é base de negócio aprovada.

## Cobertura observada (caso/esperado/observado)
Matriz completa de23nomes/estado/asserções em head-results.json e fontes hash-exatas; logs integrais em31.
- Core upload→prévia→autorização→destino→audit/check:1fatura+bytes,campos/autor/contexto/hash conferidos;0financeiro.
- Scanner captura manual→cliente→endpoint→SQL; descoberta→nova intenção explícita→ficheiro original→execução efetiva:PASS; dupla ação não duplica.
- Editor contabilidade real→cliente→endpoint→SQL:metadata alterada,bytes preservados,auditoria1; SQL before-row concorrente recusa edição obsoleta.
- Ingest v1/v2 entrypoint real:EUR/USD/BRL/GBP comFX manual local;v1 legacy_untracked,v2 novoUUID reutiliza destino único. Sem câmbio externo,sem alegar idempotência global v1.
- Perdas reserva/upload/recibo/commit/check:efeito ou estado incerto preservado,conferência read-only,sem apagar candidato/fallback cego. Perda decommit/readback CORE também exercitada.
-2conexões com barreira/rowlock,rollback após mutação antes deaudit e gate fechado durante espera:PASS;nenhum segundo efeito.
- FamíliaB não invalidaA;nova intenção só completed/latest owner;IVA>total/forte duplicado review;ASCII caixa/espaços exteriores apenas,separadores/zeros/nãoASCII mantidos;alteração debytes/preview/contexto não reutiliza prova.
- Paginação endpointSQL real>50,cursor e isolamento com coleção populada:PASS;testescliente/painel cobrem cursor repetido/resposta tardia.
- Anon/contexto forjado/bytes truncados/stream excessivo/tabelas cliente/gates:recusas verificadas;privacidade StorageAPI Cloud não é alegada.

## Correção de produto comprovada
Seleção de nova intenção no scanner permanecia travada sem caminho de autorização executável. Novo StandaloneReservedExecution exige documento original, consulta prepare,ação explícita,cliente tipado e contexto/epoch;unknown/inprogress não executam novamente. Não altera gates/config/backend/SQL. Regra documentada no AGENTS local;5testes de regra agora também na suite regular.

## Limites pendentes — NÃO anunciar ensaio completo aprovado
1.Páginas React completas em Chromium (captura/editor/nova intenção/login),estados visuais e perda real de rede da UI:integração jsdom não substitui essa prova.
2.Injeções específicas em authorize/begin,perda da confirmação nova-intenção seguida de execução recuperada e matriz integral de troca auth/empresa entre todos limites não estão integralmente demonstradas nesta suite23.
3.Matriz exaustiva MIME/tamanho/path/hash/rowversion de todoswriters e todasmoedas com mesmas corridas não é coberta só pelos casos combinados;PG31 não substitui UI de cada variante.
4.Conversa documental tem0mensagens no snapshot;IA/Gmail/Drive/BP/banco/bilheteiras indisponíveis,sem alegar integração.
5.Cloud/runtime artefacto/ativação/piloto/índiceglobal não testados nem autorizados;sem pressupor índiceglobal.
6.CI final e sincronização remota devem ser confirmadas pelo controlador após autocommit.

## Proposta única seguinte (não executada)
Continuar apenas local: completar Chromium React real e injeções authorize/begin/confirm-recovery+context epochs com o mesmo runner,SQL congelado e0Live. Critério:matrizcada caso/estado/efeito+bytes+audit,logs/exit0 e CI final;somente depois discutir eventual passoCloud com autorização própria. Não executarPublish/piloto/índice/deploy.

## Verificação pós-documentação
Runner novamente exit0 em `/tmp/issue333-head-khe0tt9m`, mesmas contagens, memória193ficheiros/frontmatter+índice regular PASS. Manifestos/snapshot/result emprova30/post-docs;logs anexados integralmente em31. CI consultada por leitura:HEAD adc01e358e56f45b9464673a3b970c6c0cac11fa,HTTP 200,runs 0;não declarar CIverde sem run success do commitfinal. SQL0190–0192/config/functions/CHATS/DECISIONS byte-iguais à baseautorizada.
